'use client'

import { useTheme } from 'next-themes'
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { Screen } from '@/components/screen'
import { REDUCED_MOTION } from '@/lib/session/boot'
import { PROMPTS } from '@/lib/session/commands'
import type { Copying, Session } from '@/lib/session/lines'
import { after, booted, KEYS, pause, UNFOCUSED } from '@/lib/session/terminal'
import { isScheme, isTheme, RESTING } from '@/lib/session/theme'

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
  const { theme, systemTheme, setTheme } = useTheme()

  /**
   * The switch, held where changing it cannot re-run anything.
   *
   * **`setTheme`'s identity moves whenever the theme does**, so naming it in
   * the intents effect below would give that effect a second way to fire --
   * and the thing it would fire with is a clipboard write it has already
   * performed. The array is replaced on exactly the transition that declares
   * an intent and on no other, which is what makes "fired once" a property of
   * the module rather than of this file's dependency list. A ref is how the
   * current function is reached without putting it in that list.
   */
  const switching = useRef(setTheme)
  switching.current = setTheme

  const replaying = pause(terminal) !== undefined

  /** Whether a question is on screen waiting for an answer. */
  const asking = terminal.session.open !== undefined

  /**
   * Who is reading, and then the boot -- in that order, from one effect.
   *
   * **The order is load-bearing and the single effect is what holds it.**
   * `after` collapses a replay in flight ahead of every input but its own
   * timer's, so a guess arriving from a second effect declared below this one
   * would land mid-replay and skip the boot outright. Dispatched here, the
   * detection settles first and the replay then deconstructs the session the
   * visitor is actually going to keep.
   *
   * The agent is read here and judged in `install.ts`, which is `REDUCED_MOTION`
   * one line down wearing different clothes: the module owns the question, the
   * component asks the browser. Neither answer is a decision this file makes.
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
    dispatch({ kind: 'detected', agent: navigator.userAgent })

    if (window.matchMedia?.(REDUCED_MOTION).matches ?? true) return

    dispatch({ kind: 'replayed' })
  }, [])

  /**
   * What the provider says the visitor is looking at, fed back in.
   *
   * **An effect of its own, because it is a subscription rather than a read.**
   * `detected` above is answered once and can therefore be ordered ahead of
   * the boot inside one effect; this has to carry every later change as well
   * -- a switch the page itself asked for, another tab writing to
   * `localStorage`, an operating system moving to dark at sunset -- so it
   * needs a dependency, and an effect with a dependency fires whenever the
   * dependency moves. Ordering protects a one-shot; only `after`'s exemption
   * protects a subscription, which is why the exemption is where the
   * correctness lives and this order is only a courtesy.
   *
   * The strings are narrowed rather than asserted. `next-themes` types both as
   * `string | undefined` and this workspace has no type assertion in it, so
   * `theme.ts` is what says which strings this page has a name for -- the
   * arrangement `install.ts` already has with a user agent.
   */
  useEffect(() => {
    dispatch({
      kind: 'preferred',
      preference: {
        theme: isTheme(theme) ? theme : RESTING.theme,
        system: isScheme(systemTheme) ? systemTheme : RESTING.system,
      },
    })
  }, [theme, systemTheme])

  /**
   * Everything the session asked to have done off the page.
   *
   * One kind today, and the array is what `lines.ts` hands over rather than
   * something this file goes looking for -- *effects that are fired and
   * forgotten*, which is what keeps the module able to declare a clipboard
   * write without being able to perform one, and what makes `SITE.md` 06's rule
   * about capturing the argument satisfiable with no browser in the room.
   *
   * Keyed on the array rather than on the session, and that is exactly right
   * because `terminal.ts` replaces it on the transition that declares an intent
   * and on no other: a boot frame hands the same array through, so a replay
   * does not re-copy, and copying the same value twice is two arrays and two
   * writes.
   *
   * **A refused write is swallowed, and that is a cost rather than a fix.** A
   * clipboard needs a secure context and can be denied outright, and there is
   * nothing useful this file can do about it -- an unhandled rejection in the
   * console helps nobody. What makes it survivable is that the command is on
   * screen with a control beside it, which is what the scrollback row is for.
   */
  useEffect(() => {
    for (const intent of terminal.session.intents) {
      if (intent.kind === 'copy') {
        void navigator.clipboard?.writeText(intent.value).catch(() => {})
        continue
      }

      switching.current(intent.theme)
    }
  }, [terminal.session.intents])

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
   * The keys a page nobody has touched yet still answers.
   *
   * **The page boots with a question on it and nothing focused**, so the
   * gesture the menu's own legend advertises -- press down, press Enter --
   * reaches no handler at all until a visitor thinks to click first. That is
   * the one interaction #86 exists to deliver, so it arrives at the window
   * instead.
   *
   * Four guards, each closing something a looser listener would have broken.
   * **Only while a question is open**, so with nothing to answer the arrows go
   * back to scrolling the page, which is what they are for. **Only while
   * nothing is focused**, so a focused field or a focused word keeps its own
   * keys -- without it, Enter on a landable word would run the word and answer
   * the question in the same keystroke. **Only unmodified**, for the reason the
   * field's own handler gives one screen down: a held modifier means the
   * keystroke is the browser's rather than the page's. And **only `UNFOCUSED`**,
   * which is why Tab is not in it: cancelling Tab here would stop focus reaching
   * the prompt at all.
   *
   * The focus question is asked of `activeElement` rather than of the event's
   * target, and the difference is not pedantic: a key pressed at a page nobody
   * has clicked on is dispatched at `body` in a browser and at `window` by a
   * test that reaches for the window directly, and `activeElement` answers the
   * question both were asking.
   *
   * It is deliberately not the skip listener with a second job. That one is
   * over once the boot is, and this one has not started until then -- the first
   * key of a replay means *stop the animation*, and should not also move a
   * cursor the visitor has not seen arrive.
   *
   * **It hands focus to the prompt on the way through, and that is what makes
   * the state visible.** Driven from `body`, the selection moves while the
   * browser's focus is nowhere a visitor can see, which is a menu being
   * operated with no focus indicator on the page at all. Moving focus to the
   * field on the first forwarded key inverts the sigil -- this page's own focus
   * state -- and every key after it arrives at the field's handler rather than
   * here. Not on mount, because a page that grabs focus before anybody has
   * pressed anything scrolls itself on a small screen; on the keystroke, which
   * is somebody asking for it.
   */
  useEffect(() => {
    if (replaying || !asking) return

    const forward = (event: KeyboardEvent) => {
      if (document.activeElement !== document.body) return
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return

      const kind = UNFOCUSED[event.key]
      if (kind === undefined) return

      event.preventDefault()
      dispatch({ kind })
      input.current?.focus()
    }

    window.addEventListener('keydown', forward)
    return () => window.removeEventListener('keydown', forward)
  }, [replaying, asking])

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

  /**
   * A control was used.
   *
   * The same shape as `onRun` and deliberately not the same path: this prints
   * nothing, so focus has nowhere to fall, and what it returns to is the prompt
   * it came from. The write itself is the effect above -- this only declares
   * it, exactly as a command would.
   */
  const onCopy = useCallback((intent: Copying) => {
    dispatch({ kind: 'copied', intent })
    input.current?.focus()
  }, [])

  return (
    <>
      <Screen session={terminal.session} onRun={onRun} onCopy={onCopy} />

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
