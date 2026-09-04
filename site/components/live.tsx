'use client'

import { useCallback, useReducer, useRef } from 'react'
import { Screen } from '@/components/screen'
import { PROMPTS } from '@/lib/session/commands'
import type { Session } from '@/lib/session/lines'
import { after, booted, KEYS } from '@/lib/session/terminal'

/**
 * The page, made live.
 *
 * The only client component on the site, and the only place a keystroke turns
 * into a state transition. It performs; it decides nothing. Which key means
 * what is `KEYS` in the session module, what a command prints is `commands.ts`,
 * and how the state moves is `after` -- all three answerable under `bun test`
 * with no browser in the room. What is left here is wiring, and `wiring/` is
 * what holds it.
 *
 * **It is called `Live` rather than `Terminal` on purpose:** the type it drives
 * is already called `Terminal`, and a component cannot share a name with a type
 * it has to import.
 *
 * The caret is deliberately not in the state. A completion or a recall replaces
 * the buffer, React writes the new string onto the element, and assigning to an
 * `input`'s `value` puts the caret at the end by itself -- while ordinary typing
 * is untouched, because React skips the assignment when the string already
 * matches. Tracking a caret here would mean owning selection, composition and
 * every phone keyboard's opinion about both.
 */
export const Live = ({ initial }: { initial: Session }) => {
  const [terminal, dispatch] = useReducer(after, initial, booted)
  const input = useRef<HTMLInputElement>(null)

  /**
   * A word was clicked.
   *
   * Focus moves back to the prompt every time, unconditionally -- which matters
   * most in the case that is easiest to miss: running `clear` from a word
   * deletes the element the cursor was standing on, and focus would otherwise
   * fall to `<body>` and leave a keyboard user nowhere. It is unconditional
   * rather than decided per command, which is exactly why it is wiring and not
   * an intent the module declares.
   */
  const onRun = useCallback((command: string) => {
    dispatch({ kind: 'chosen', command })
    input.current?.focus()
  }, [])

  return (
    <>
      <Screen session={terminal.session} onRun={onRun} />

      <div className="u-prompt">
        <span aria-hidden="true">{PROMPTS.site}</span>
        <input
          ref={input}
          className="u-input"
          value={terminal.buffer}
          onChange={(event) => dispatch({ kind: 'typed', value: event.target.value })}
          onKeyDown={(event) => {
            // A held modifier means the keystroke is the browser's, not the
            // prompt's. **Shift+Tab is the one that matters and it arrives as
            // `Tab`:** cancelling it would trap focus in this field, because
            // going backwards is the only way out of it towards the words above.
            // Found by `e2e/prompt.spec.ts`, which could not reach a word to
            // measure its focus state and was right not to be able to.
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return

            const kind = KEYS[event.key]
            if (kind === undefined) return

            // Without this, Tab walks focus out of the field and the arrows
            // jump the caret to either end of the line -- two bugs no other
            // seam can see, which is why `wiring/` asserts this and not the
            // behaviour behind it.
            event.preventDefault()
            dispatch({ kind })
          }}
          aria-label="type a command"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </div>

      {/*
       * What was just printed, and only that.
       *
       * Putting `aria-live` on the scrollback itself is the obvious move and is
       * wrong here: it mutates by hundreds of nodes when the cap trims, some
       * assistive technology handles a mutation that size badly, and none of it
       * is assertable outside a real screen reader. A region holding exactly
       * the last output is checkable, and `wiring/` checks it.
       *
       * The `key` is load-bearing. `help` run twice prints the same sentence
       * twice, and a live region whose text did not change is one an assistive
       * technology is right to ignore. Keying the child on the print count
       * replaces the node, which is a mutation the region does see, and
       * `aria-atomic` makes it read the whole thing again.
       *
       * The echo is not in here: the visitor typed it.
       */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <p key={terminal.printed}>{terminal.announcement}</p>
      </div>
    </>
  )
}
