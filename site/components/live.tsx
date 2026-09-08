'use client'

import { BashShell } from '@wterm/just-bash'
import { Terminal, useTerminal, type WTerm } from '@wterm/react'
import { defineCommand } from 'just-bash'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Chips } from '@/components/chips'
import { CLI_VERSION } from '@/lib/content'
import { CHIPS, NAMES } from '@/lib/session/commands'
import { CRLF, TYPED, written, type Intent } from '@/lib/session/lines'
import { answered, greeting, reworded, started } from '@/lib/session/shell'
import { isScheme, isTheme, RESTING, type Preference } from '@/lib/session/theme'

/**
 * The page, which is now a shell -- #112.
 *
 * **This file owns the library and nothing else does.** Every decision about
 * what the page says lives in `lib/session/`, which imports no emulator and no
 * shell; this is the adapter between that and `@wterm/react`, and it is
 * deliberately thin. #114 records that the renderer is pre-1.0, which is a
 * promise that it will change -- and the whole of what a change costs is this
 * file, because the verbs, the copy deck and the generated help text never
 * learned it existed.
 *
 * What replaced 500 lines of reducer: bash. Line editing, history, recall and
 * tab completion were all site code imitating a shell, and there is a real one
 * now, so they are gone rather than ported. What is left here is the three
 * things a shell cannot do for itself -- register the page's verbs, perform the
 * effects they declare, and paint the result in the site's palette.
 */

/** Asked of a browser rather than declared, and only this file has one to ask. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export const Live = () => {
  const { ref, write } = useTerminal()
  const { theme, systemTheme, setTheme } = useTheme()

  const shell = useRef<BashShell | null>(null)

  /** Whether the emulator has already been handed to `onReady` once. */
  const booting = useRef(false)

  /** The pinned block, held so `Escape` has somewhere to put focus. */
  const status = useRef<HTMLDivElement | null>(null)

  /**
   * Whether the visitor asked for less of it, and `undefined` until asked.
   *
   * The terminal is not rendered until this is answered, which is the one place
   * this page waits for anything. `cursorBlink` is read when the emulator is
   * constructed rather than watched, so a terminal mounted before the question
   * was asked would blink at somebody who asked it not to and never stop.
   *
   * A frame's delay is what that costs, and it costs nothing else: #114 records
   * that the served-HTML floor is gone regardless -- a WASM terminal cannot
   * render on a build machine -- so there is no first paint here being spoiled.
   */
  const [reduced, setReduced] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    setReduced(window.matchMedia?.(REDUCED_MOTION).matches ?? true)
  }, [])

  /**
   * What the visitor's browser is set to, held where a command can read it.
   *
   * A ref rather than state, and read rather than closed over, because the
   * commands below are registered once and run for the life of the page: a
   * `preference` captured at registration would report the theme the page
   * loaded with forever. `next-themes` owns the answer and this is the return
   * leg of it.
   */
  const preference = useRef<Preference>(RESTING)
  preference.current = {
    theme: isTheme(theme) ? theme : RESTING.theme,
    system: isScheme(systemTheme) ? systemTheme : RESTING.system,
  }

  /**
   * What has to happen off the page, performed.
   *
   * Unchanged in behaviour from the reducer this replaced, and it has to be:
   * `install` still copies, `theme` still switches, and both still travel as
   * declarations because neither is expressible as a pure function of state.
   * What changed is only who calls it -- a command running inside bash rather
   * than a React event handler, which is why it is reached through a ref.
   */
  const perform = useRef<(intents: readonly Intent[]) => void>(() => {})
  perform.current = (intents) => {
    for (const intent of intents) {
      if (intent.kind === 'copy') {
        void navigator.clipboard?.writeText(intent.value).catch(() => {})
        continue
      }

      setTheme(intent.theme)
    }
  }

  /**
   * The shell, built and then taught the page's words.
   *
   * **The order is forced.** `BashShell` constructs its `Bash` lazily inside
   * `attach`, so `shell.bash` is null until that resolves and nothing can be
   * registered before it. That is also why the greeting is static text: at the
   * moment it is written, no command the page owns exists yet.
   *
   * Every name in the registry is registered, not just `jukebox`. That is what
   * makes the five menu entries runnable by typing them, and what keeps the
   * page's own five verbs working -- `help` and `clear` shadowing bash's
   * built-ins of the same name, which is what custom commands are for.
   */
  const run = useCallback(
    (wt: WTerm) => {
      if (shell.current !== null) return

      /**
       * The way out of the terminal, for somebody who cannot use a mouse.
       *
       * **Without this the page is a keyboard trap, which is a failure rather
       * than an inconvenience.** The emulator focuses its own textarea as it
       * boots and then consumes every `Tab`, because in a shell `Tab` is
       * completion -- so focus enters the terminal on load and has no way back
       * out. Measured before this existed: three `Tab`s in a row left
       * `document.activeElement` on the textarea, and the chip row was only
       * ever reachable by blurring it from a script. WCAG 2.1.2 is explicit
       * that focus must be movable away with the keyboard alone, and #112 asks
       * in as many words for the chips to stay *keyboard reachable*.
       *
       * `Escape` rather than freeing `Tab`, because tab completion is itself
       * one of this ticket's criteria -- the shell provides it and the page is
       * not allowed to take it back. Going the other way needs nothing: the row
       * sits after the terminal in the document, so `Shift+Tab` off the first
       * chip returns focus the way it came.
       *
       * Registered in the capture phase on the emulator's own element, which is
       * what gets in front of its input handler; the keystroke is stopped there
       * rather than let through, so the shell never sees an `Escape` that was
       * meant for the page.
       */
      wt.element.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'Escape') return

          const chip = status.current?.querySelector<HTMLElement>('.u-word')
          if (chip === null || chip === undefined) return

          event.preventDefault()
          event.stopPropagation()
          chip.focus()
        },
        { capture: true },
      )

      const answering = (line: string) => {
        const { stdout, intents } = answered(line, preference.current)
        perform.current(intents)

        return { stdout, stderr: '', exitCode: 0 }
      }

      // **`cwd` is `/` because the filesystem is empty, and that is not a
      // detail.** The adapter runs every line as `cd "<cwd>" && <line>`, so a
      // working directory that does not exist fails the `cd`, short-circuits the
      // `&&`, and silently swallows the command -- printing a `cd` error where
      // the answer should have been. Its own default is `/home/user`, which
      // nothing has created, so the first thing any visitor typed was thrown
      // away.
      //
      // `/` always exists. Seeding a home directory instead would mean inventing
      // a file to create it, and inventing files is #113's ticket rather than
      // this one's -- when it lands, this can move back to a home with something
      // in it.
      const made = new BashShell({ cwd: '/', greeting: greeting(CLI_VERSION, wt.cols) })
      shell.current = made

      // Bash's own message is reworded on the way out rather than intercepted on
      // the way in, so what decides whether a word is a command is still bash.
      void made.attach((data) => write(reworded(data))).then(() => {
        const bash = made.bash
        if (bash === null) return

        for (const name of NAMES) {
          bash.registerCommand(
            defineCommand(name, async (args) => answering([name, ...args].join(' '))),
          )
        }

        // `jukebox` alone is the one word this page taught for four tickets, so
        // it answers with what the binary answers with rather than falling
        // through to *command not found* for the name of the program. `wt.cols`
        // is read here rather than captured, so a window resized since the
        // greeting still gets the right branch.
        bash.registerCommand(
          defineCommand(TYPED, async (args) =>
            args.length === 0
              ? { stdout: written(started(CLI_VERSION, wt.cols)) + CRLF, stderr: '', exitCode: 0 }
              : answering(args.join(' ')),
          ),
        )
      })
    },
    [write],
  )

  /**
   * The measurement the greeting waits on.
   *
   * **`wt.cols` is the constructor's default of 80 when `onReady` fires, and
   * that was a bug a phone could see.** The `ResizeObserver` set up inside
   * `WTerm.init()` delivers its first callback after `init()` resolves -- which
   * is to say after this has already run -- so a greeting composed here reads
   * 80, clears `NATURAL`, and takes the wide branch on every viewport. The grid
   * then shrinks under it: at 375 the emulator settles at 44 columns and the
   * art is painted anyway, truncated mid-row at column 43. The narrow branch
   * exists precisely so that screen gets a plain version line instead, and it
   * was never reached.
   *
   * Observing the element ourselves is what closes it. A `ResizeObserver`
   * always delivers an initial callback for whatever it observes, and this one
   * is registered after the emulator's own, so by the time it runs the resize
   * has been applied and `wt.cols` is the real count. **Waiting on `onResize`
   * instead would hang on the one viewport that measures 80**, where the
   * emulator finds nothing to change and so never reports a size at all.
   *
   * `booting` guards the registration rather than `shell`, because the shell
   * does not exist until a frame after this returns -- a second `onReady` in
   * between would otherwise start a second observer.
   */
  const onReady = useCallback(
    (wt: WTerm) => {
      if (booting.current) return
      booting.current = true

      const observer = new ResizeObserver(() => {
        observer.disconnect()
        run(wt)
      })

      observer.observe(wt.element)
    },
    [run],
  )

  /**
   * A chip, run the way a keystroke is.
   *
   * Through `handleInput` rather than through a second path into the verbs, so
   * the line echoes at the prompt and enters exactly as if it had been typed --
   * there is one way a command reaches bash and this is it. Focus is
   * deliberately not moved: on a phone, focusing the terminal raises the
   * keyboard over the row that was just tapped.
   */
  const onChip = useCallback((command: string) => {
    void shell.current?.handleInput(`${command}\r`)
  }, [])

  return (
    <>
      {reduced === undefined ? null : (
        <Terminal
          ref={ref}
          className="u-terminal"
          autoResize
          cursorBlink={!reduced}
          onReady={onReady}
          onData={(data) => void shell.current?.handleInput(data)}
          // What a screen reader is told about the way out. The behaviour is
          // above; this is the half that makes it discoverable to somebody who
          // cannot see the row it lands on.
          aria-keyshortcuts="Escape"
        />
      )}

      <div className="u-status" ref={status}>
        <Chips chips={CHIPS} onRun={onChip} />
      </div>
    </>
  )
}
