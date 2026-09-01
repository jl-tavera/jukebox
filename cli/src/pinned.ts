/**
 * The wordmark, held still while everything else scrolls under it.
 *
 * #66. The mark used to be drawn once, above the loop, and the first Sync report
 * pushed it off the top -- so the thing that makes the CLI look like the site it
 * was installed from was on screen for about one action. This fences the rows
 * below it into a scroll region, so those rows scroll and the ones above them
 * cannot.
 *
 * **Both streams reach the same terminal, which is what makes this cheap.** The
 * region is a property of the terminal rather than of a stream, so a result
 * `render` writes to stdout scrolls under the header exactly as a prompt written
 * to stderr does. The menu never has to draw a result to keep one inside the
 * frame, and ADR-0007's launcher rule is untouched by the whole file.
 *
 * **What it costs is the scrollback, and that was decided rather than
 * discovered.** A terminal banks a line when it scrolls off the top of the whole
 * screen; with a top margin set, a line leaving the region is discarded instead.
 * #50's story 12 survives -- what you just ran is on screen and stays there until
 * enough scrolls past it -- and story 13 does not, beyond the last screenful. It
 * is still not an alternate screen: nothing is restored out from under the
 * reader, and what is on the screen at the end stays there.
 *
 * Shaped like `spinner.ts`, and for that file's reasons rather than by analogy.
 * It is handed where to write and whether to do anything at all, so both of its
 * branches are reachable from a test that drives `main`; and it installs nothing
 * on the process. A `SIGWINCH` listener would keep the region right across a
 * resize, and would be the first such reach this program makes -- the four
 * ADR-0007's amendment counts are the prompt library's, which is the whole
 * reason that library's spinner went unused. #50 puts resize handling out of
 * scope by name, which is the same answer arrived at from the other side.
 */

/**
 * The whole screen, and the cursor back at the top of it.
 *
 * The mark has to start on row 1 for the rows under it to be the ones that
 * scroll, and this is what puts it there. It is also the second thing the pin
 * costs, after the scrollback: whatever was on the screen when `jukebox` was
 * run -- the shell prompt, and whatever the reader ran before it -- goes. Said
 * here rather than left to be met, because "nothing is restored out from under
 * the reader" is a promise about leaving, and this is what arriving does.
 *
 * Not exported, where `region` and `RELEASED` are. A test has to name the rows
 * that were fenced and the giving back; nothing outside this file has a reason
 * to name the clear.
 */
const CLEARED = '\x1b[2J\x1b[H'

/**
 * The scroll region: the first row that may scroll, and the last.
 *
 * DECSTBM. Everything above `top` is then outside it and cannot be scrolled by
 * anything written below.
 *
 * Exported as the function rather than as a formatted string, because what a
 * test has to say is which rows were fenced -- and a test spelling `\x1b[8;24r`
 * by hand would be pinning the escape rather than the decision.
 */
export const region = (top: number, bottom: number): string => `\x1b[${top};${bottom}r`

/**
 * The region given back, which is the whole of the undo.
 *
 * `ESC [ r` with no parameters restores the full screen. Deliberately not paired
 * with a clear: the last screenful is what the reader was looking at, and this
 * runs when they have just asked to leave.
 */
export const RELEASED = '\x1b[r'

/** The cursor at the start of one row, since setting a region sends it home. */
const at = (row: number): string => `\x1b[${row};1H`

/**
 * How many rows the menu needs under the mark before pinning is worth it.
 *
 * The top level is a question and five entries, and a region that could hold
 * those and nothing else would be a frame around a menu with no room to answer
 * in. Below this the header is drawn once and the terminal is left alone, which
 * is what every session did before #66 and is strictly better than a pin that
 * squeezes the thing being pinned around.
 */
export const MINIMUM_BELOW = 10

/**
 * Draws the header, holds it, and hands back the way to let go.
 *
 * `fixed` is false wherever the error stream is not a terminal --
 * `jukebox 2>log.txt` at a console -- and there this is exactly what the menu
 * did before: the mark, a blank line, and no escape sequences to write into a
 * file. It is the same split `menu.ts` makes for colour and `spinner.ts` makes
 * for animation, asked about the same stream.
 *
 * The order is the part that is easy to get wrong. Setting a region sends the
 * cursor home, so the move into the region has to come after it rather than
 * before, or the first thing written lands on top of the mark.
 *
 * Releasing carries no guard against a second call, where the spinner's stop
 * does, and the difference is worth the sentence. That one is called twice by
 * design and draws an erase, so a second one would leave a stray clear after
 * whatever had already been rendered. This has a single caller -- the `finally`
 * in `menu.ts`, which runs once -- and giving back a region already given back
 * writes an escape the terminal reads and ignores.
 */
export const pinning = (
  header: string,
  write: (text: string) => void,
  rows: number,
  fixed: boolean,
): (() => void) => {
  // The mark, plus the blank line under it that the menu has always drawn. Both
  // are held, so the frame has a floor and the first prompt is not flush against
  // the version.
  const height = header.split('\n').length + 1

  if (!fixed || rows - height < MINIMUM_BELOW) {
    write(header + '\n\n')
    return () => {}
  }

  const top = height + 1

  write(CLEARED + header + '\n\n' + region(top, rows) + at(top))

  return () => void write(RELEASED)
}
