/**
 * The spinner: the one piece of chrome that moves.
 *
 * It exists for the Sync over a dozen Playlists, which is the only thing
 * Jukebox does that can take long enough to look like a hang. #50 asks for it
 * by name, and it is **chrome rather than progress reporting** -- the command it
 * covers still computes and then renders, so ADR-0007's launcher rule survives
 * intact. Nothing here knows what is being waited for, and there is no way to
 * tell it: a spinner that could be advanced from inside a command would be a
 * command printing as it goes, which is the one shape this program does not
 * have.
 *
 * **Written rather than imported, and the prompt library settled that rather
 * than taste.** ADR-0007 left the choice open with a condition -- either the
 * library's spinner is driven through the same error sink as everything else,
 * or it is written here -- and it cannot be so driven. It takes an `output` but
 * no `input`, and starts by calling `block()`, which defaults its input to the
 * real `process.stdin`: a listener on a stream the `Io` that was handed over
 * says nothing about, in a program whose whole discipline is that streams are
 * given rather than reached for. On a cancel key that listener calls
 * `process.exit(0)`, which `index.ts` sets an exit code specifically to avoid.
 * It also installs `SIGINT`, `SIGTERM`, `exit` and `uncaughtExceptionMonitor`
 * handlers on the process, and measures its width from a stream that has none.
 * Four reaches outside this run, for four lines of animation.
 *
 * Pure in the same way `header.ts` is: handed where to write and whether to
 * animate, rather than asking. That is what makes both branches reachable from
 * a test that drives `main`.
 */

/**
 * Quadrant blocks, one corner at a time.
 *
 * Block Elements (U+2580-U+259F), which is the range `wordmark.ts` already
 * commits this program to on every terminal that opens the menu. A spinner
 * drawn from Braille or geometric shapes would be a second font requirement
 * bought for decoration, and the first place it failed would be the console
 * that renders the wordmark fine.
 *
 * Exported, with the delay below, for the same reason `header.ts` exports the
 * width it switches at: what a test has to assert is that the thing moves, and
 * pinning a particular glyph at a particular millisecond would pin neither the
 * motion nor anything a reader would miss.
 */
export const FRAMES = ['\u2596', '\u2598', '\u259D', '\u2597']

/** Slow enough not to strobe, fast enough to read as motion. */
export const DELAY_MS = 120

/**
 * Back to the start of the line, and nothing left on it.
 *
 * Erasing the whole line rather than overwriting with spaces, so the width of
 * the previous frame is never something this has to remember. It clears the row
 * the cursor is on and no other, which is why the message is one short line by
 * construction -- `menu.ts`'s `WORKING` is where that is kept true. A message
 * long enough to wrap would leave its first rows behind.
 *
 * Exported because it is the last thing a stopped spinner writes, and so the
 * one mark in a transcript that says where the line was cleared.
 * `menu.test.ts` reads it to assert the clearing happened before the answer
 * was written, which is the whole reason `Launch` carries a `computed`.
 */
export const ERASED = '\r\x1b[2K'

/**
 * Starts a spinner, and hands back the way to stop it.
 *
 * The first frame is drawn **synchronously**, before this returns. A command
 * that answers inside one interval would otherwise show nothing at all, and the
 * difference between "fast" and "never started" is not one to leave to timing.
 *
 * `animated` is false wherever the error stream is not a terminal --
 * `jukebox 2>log.txt` at a console is the case -- and there the message is said
 * once, plainly, with no escape sequences to write into a file. It is the same
 * split `menu.ts` already makes for colour, asked about the same stream.
 *
 * Stopping is idempotent and leaves the cursor at column 0 with nothing behind
 * it, so whatever renders next starts on a clean line. The cursor is never
 * hidden: showing it again after a Ctrl-C would need a handler on the process,
 * and a handler on the process is why the library's spinner is not being used.
 */
export const spinning = (
  message: string,
  write: (text: string) => void,
  animated: boolean,
): (() => void) => {
  if (!animated) {
    write(message + '\n')
    return () => {}
  }

  let frame = 0
  const draw = (): void => void write(ERASED + FRAMES[frame % FRAMES.length] + ' ' + message)

  draw()
  const ticking = setInterval(() => {
    frame += 1
    draw()
  }, DELAY_MS)

  let stopped = false

  return () => {
    // Idempotent because two things call it: the moment the answer is computed,
    // and a `finally` covering the launch that never got that far. Clearing an
    // interval twice is harmless; drawing the erase twice would put a stray one
    // after whatever had already been rendered.
    if (stopped) return
    stopped = true

    clearInterval(ticking)
    write(ERASED)
  }
}
