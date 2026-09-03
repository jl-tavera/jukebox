import { WORDMARK } from '../content'
import { blank, ink, row, type Line } from './lines'

/**
 * What the binary prints above its menu: a blank row, the mark, and what this
 * binary is.
 *
 * A port of `cli/src/header.ts`, and deliberately a narrower one. That function
 * is handed three answers -- a width, a version and whether colour is available
 * -- and two of them have no question here:
 *
 * - **No width, so no narrow fallback.** The CLI swaps the art for the word
 *   `JUKEBOX` below 67 columns, because a terminal one column short wraps all
 *   five rows into noise. A browser has no column count and does not wrap a
 *   `<pre>`; the art is fitted by a clamp instead, which is `SITE.md` 03's job
 *   and not this module's.
 * - **No colour, so no escapes.** The CLI writes a truecolor escape because a
 *   terminal is the only place that is how you say yellow. Here the mark is
 *   painted by a stylesheet, from the tokens both themes already swap.
 *
 * What is not narrowed is the shape, and the shape is the point: three lines,
 * in this order, and **no description line**. `cli/src/root.ts` has one and it
 * reaches a screen only through `--help` -- so a faithful boot has nowhere to
 * put the lede, which is why the lede sits above the boot as a comment.
 */

/** What the mark says, for anything that cannot see it. */
export const ART_LABEL = 'Jukebox'

/**
 * The version line, exactly as `cli/src/header.ts` composes it.
 *
 * Exported so a test pins this string rather than a paraphrase of it, the way
 * the CLI exports `NARROW_MARK` and `ENTRIES` for the same reason. A fact
 * rather than a task, which is why the binary prints it under the mark instead
 * of listing it in the menu.
 */
export const versionLine = (version: string): string => `jukebox ${version}`

export const header = (version: string): Line[] => {
  // The mark opens with a blank row, out of the banner it is generated from --
  // `cli/scripts/generate-wordmark.ts` measures exactly one and refuses to
  // write anything else. It is promoted to a line of the session rather than
  // carried inside the art, and that is what removes a hazard the old page had
  // to work around: a browser drops the newline immediately after a `<pre>`
  // start tag, so art beginning with one renders differently from what was
  // served. Here the art never begins with one, and the row the CLI shows is
  // shown.
  const [, ...art] = WORDMARK.split('\n')

  return [
    blank(),
    { kind: 'art', text: art.join('\n'), label: ART_LABEL },
    row(ink(versionLine(version))),
  ]
}
