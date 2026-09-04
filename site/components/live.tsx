'use client'

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { Screen } from '@/components/screen'
import { REDUCED_MOTION } from '@/lib/session/boot'
import { PROMPTS } from '@/lib/session/commands'
import type { Session } from '@/lib/session/lines'
import { after, booted, KEYS, pause } from '@/lib/session/terminal'

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
 * **#84's boot is three effects here and no decision.** Whether to replay is a
 * media query, when the next frame lands is a number `pause` hands over, and
 * what a frame contains is `boot.ts`. Nothing below chooses any of it.
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

  const replaying = pause(terminal) !== undefined

  /**
   * The boot, started once the page is really on a screen.
   *
   * **A layout effect rather than an ordinary one, and it buys exactly one
   * frame.** The static export ships the finished session, so the browser has
   * already painted it long before React hydrates -- there is no arrangement of
   * effects that prevents that, and #84's own wording concedes it: JavaScript
   * *clears* the finished session and replays it. What running before paint
   * avoids is the extra frame `useEffect` would spend showing it a second time,
   * after hydration, on the way to rewinding.
   *
   * **A visitor who asked for reduced motion is left alone, and doing nothing
   * is the whole of the correct behaviour** -- the criterion is that reduced
   * motion renders the session rather than nothing, and the state already *is*
   * that session. A missing `matchMedia` is read the same way: failing to the
   * floor is the safe direction, which is the argument `globals.css` makes
   * about its own fallback one file over.
   *
   * **One cost, recorded rather than glossed.** Most screen-reader users do not
   * set a motion preference, and for them the session is removed and rebuilt
   * under a virtual cursor across a second and a half. Nothing is announced
   * while that happens -- `announcement` is empty and `printed` is zero until a
   * command runs, so the live region is correctly silent -- which means the
   * content leaves and returns with no explanation. ADR-0010 sells the served
   * HTML partly on a screen reader getting the whole session, and it does get
   * it, before and after; what it does not get is a reason for the gap. The
   * honest fix is a preference this page cannot see, so this is a known cost
   * rather than a solved problem.
   */
  useLayoutEffect(() => {
    if (window.matchMedia?.(REDUCED_MOTION).matches ?? true) return

    dispatch({ kind: 'replayed' })
  }, [])

  /**
   * One frame, held for as long as it asked to be.
   *
   * Keyed on the whole terminal rather than on the pause: two rows in a row are
   * held for the same sixty milliseconds, so a dependency on the number alone
   * would schedule the first and never the second. Once the boot is over
   * `pause` answers `undefined` and this returns before doing anything, which
   * is every render after the first second and a half.
   */
  useEffect(() => {
    const held = pause(terminal)
    if (held === undefined) return

    const timer = setTimeout(() => dispatch({ kind: 'advanced' }), held)
    return () => clearTimeout(timer)
  }, [terminal])

  /**
   * Any keypress reaches the end of it.
   *
   * On `window`, because at boot nothing is focused and a keystroke never
   * reaches the field's own handler. Unmodified is not checked and the field's
   * rule about modifiers does not apply: #84 says *any* keypress, and somebody
   * reaching for Ctrl+R has still seen the boot. Nothing is cancelled either --
   * a key pressed into the focused prompt must still land in it.
   *
   * **Keys only, which is what #84 asks for and no more.** A tap would be the
   * same listener on `pointerdown`, and it is deliberately not here: a phone has
   * no keys, so the escape is unavailable there, and what that costs is a second
   * and a half of a boot the visitor arrived to see. #89 is the ticket that
   * makes this page work by tapping, and a tap that skips belongs with it.
   */
  useEffect(() => {
    if (!replaying) return

    const skip = () => dispatch({ kind: 'skipped' })

    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [replaying])

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
