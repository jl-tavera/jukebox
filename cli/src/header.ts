import { WORDMARK } from './wordmark'

/**
 * The wordmark as a terminal draws it: at a width, and in a colour.
 *
 * Separate from `wordmark.ts`, which says of itself that it is the art at its
 * natural width and "carries no escape sequences, so that the width stays
 * countable". That file is generated from the banner in `DESIGN.md` and its
 * bytes are what CI diffs, so everything a terminal needs and a page does not
 * belongs on this side of the line -- and nothing on that side may be typed by
 * hand.
 *
 * Pure, and handed its three answers rather than asking for them. Width comes
 * off `Io`, which is why the narrow branch is reachable from a test that drives
 * `main`; colour is decided by whoever calls this, which is the only way the
 * uncoloured branch is reachable at all -- the colour library computes its
 * answer once at import from the real process, and no test can move it.
 */

/**
 * The art's natural width, and the whole of why there is a second rendering.
 *
 * Every row of art is exactly this -- the blank one the mark opens with is the
 * exception, and the only one. A terminal one column narrower wraps all five
 * rows onto five more, and the letterforms come apart into noise rather than
 * into a smaller mark.
 *
 * The number is written twice on purpose: `cli/scripts/generate-wordmark.ts`
 * carries its own `COLUMNS = 67` and measures the banner against it before
 * writing it anywhere. That script reads bytes rather than importing anything
 * -- its docblock explains why -- so a shared constant would have to be
 * imported by the one file that must not import. Two copies of a number that
 * has never moved, and a generator that fails loudly if it ever does.
 */
export const NATURAL = 67

/**
 * What the art spells, for a terminal too narrow to hold it.
 *
 * A word rather than a second piece of art. Art at a smaller size would be a
 * second thing to keep in step with the site, and #52's check compares exactly
 * one pair of copies.
 *
 * Named for what it is rather than for when it is used: `NARROW_MARK` alone reads as
 * the width below which the fallback fires, which is `NATURAL` above.
 */
export const NARROW_MARK = 'JUKEBOX'

/**
 * The site's `--ink`, as a truecolor escape.
 *
 * Written out rather than reached for: picocolors carries the basic sixteen and
 * neither truecolor nor hex, so `#ffd400` is not expressible through it. What
 * the library is used for is the one boolean this function is handed -- whether
 * to emit this at all.
 *
 * The site inverts the mark against a light background. A terminal cannot
 * reliably be asked what colour it is painted, so that trick is unavailable
 * here; on a light theme the mark is low-contrast, which is acceptable because
 * it is decorative and nothing that has to be read is affected.
 */
const YELLOW = '\x1b[38;2;255;212;0m'

/** Back to whatever the terminal was using. The colour alone, not every attribute. */
const PLAIN = '\x1b[39m'

/**
 * What sits above the menu: a blank row, the mark, and what this binary is.
 *
 * The version is a line under the wordmark rather than an entry in the menu,
 * because it is a fact rather than a task. The blank row above the mark is
 * #68's, and #66 is why it is wanted: the header is pinned to the top of the
 * screen now, so without it the art sits hard against the edge.
 *
 * Each row is bracketed on its own rather than the block being wrapped whole,
 * and not because of width -- an escape is zero columns either way. It is that
 * a colour left open across a newline is a colour some terminals carry down the
 * next line and others reset, and the one thing this file can settle is that no
 * escape ever spans one. It also leaves each row a contiguous run of bytes, so
 * that what asserts the art arrived does not have to strip escapes back out of
 * it first.
 */
export const header = (columns: number, version: string, colour: boolean): string => {
  // The art carries its own blank row, out of the banner it is generated from.
  // The word does not, and gets one here rather than in `wordmark.ts` -- that
  // file is the art, and this is what stands in for the art where it will not
  // fit. Without it a narrow terminal sits flush against the top of the screen
  // while a wide one does not, which is the whole of what #68 was about.
  const mark = columns >= NATURAL ? WORDMARK : '\n' + NARROW_MARK

  // The blank row is left uncoloured. Bracketing nothing in a colour and a
  // reset is two escapes that change nothing, on the one row nobody is meant to
  // see.
  const rows = mark.split('\n').map((row) => (colour && row !== '' ? YELLOW + row + PLAIN : row))

  return [...rows, `jukebox ${version}`].join('\n')
}
