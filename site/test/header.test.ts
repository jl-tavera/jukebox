import { describe, expect, it } from 'bun:test'
import { WORDMARK } from '../lib/content'
import { ART_LABEL, header, versionLine } from '../lib/session/header'

/**
 * The boot, asked the one question the page cannot answer by looking: does it
 * print what the binary prints?
 *
 * A pure function tested directly, the way `cli/test/header.test.ts` tests the
 * function this is a port of. Nothing here renders, and nothing here needs a
 * browser -- what the page does with these lines is the renderer's business,
 * and whether five rows of art measure the same width is #83's.
 *
 * The art is never written down here. It is generated into `lib/content.ts`
 * from the banner in `docs/design/DESIGN.md`, CI regenerates and diffs it, and
 * a copy typed into a test would be a third one that no diff checks.
 */

/**
 * The mark's rows, split where `header()` splits them.
 *
 * Taken as "everything after the first row" rather than as "every row that is
 * not empty", because that is what the header does -- and a filter here would
 * quietly agree with an implementation that had started dropping a blank row
 * from the middle of the art. The assumption underneath both is that the mark
 * opens with exactly one blank row, so that is asserted rather than shared:
 * `cli/scripts/generate-wordmark.ts` measures it, and the first test below is
 * where this file stops taking it on trust.
 */
const [MARK_OPENS_WITH, ...ART_ROWS] = WORDMARK.split('\n')

describe('the header the binary prints', () => {
  it('is written from a mark that opens with exactly one blank row', () => {
    // The assumption every other assertion in this file rests on, asserted
    // once instead of spread through them as a filter. #68 gave the art this
    // row and the generator measures it; if the banner ever gained a second,
    // this fails here rather than everywhere at once.
    expect(MARK_OPENS_WITH).toBe('')
    expect(ART_ROWS[0]).not.toBe('')
  })

  it('opens with a blank row', () => {
    // #68's row, and #66 is why the CLI wants it: its header is pinned to the
    // top of a terminal and the art sat hard against the edge. It is a line of
    // the session rather than a gap between two, which is why it is a `blank`
    // and not a margin.
    expect(header('0.1.0')[0]).toEqual({ kind: 'blank' })
  })

  it('carries every row of the art', () => {
    const art = header('0.1.0')[1]

    // Counted off `WORDMARK` rather than written out, so a sixth row of art is
    // rendered rather than silently skipped -- and so the trailing spaces two
    // of these rows carry are asserted by the same equality. Hand-copying has
    // dropped them once already, which is why nobody types this any more.
    expect(art).toEqual({ kind: 'art', text: ART_ROWS.join('\n'), label: ART_LABEL })
  })

  it('hands the renderer art that does not open with a newline', () => {
    // A browser drops the newline immediately after a `<pre>` start tag, so art
    // beginning with one would render differently from what was served -- a
    // hydration mismatch on a static export. The mark's leading newline is not
    // stripped here, it is promoted: it became the blank row above, which is
    // what the terminal actually shows.
    const art = header('0.1.0')[1]
    expect(art?.kind === 'art' && art.text.startsWith('\n')).toBe(false)
  })

  it('names the binary and its version', () => {
    expect(versionLine('1.2.3')).toBe('jukebox 1.2.3')
  })

  it('carries no description line', () => {
    // Asserted by shape rather than by quoting a sentence the site does not
    // own. Three lines is the whole header, so there is nowhere for a fourth to
    // be. The CLI has a description -- `cli/src/root.ts` -- and it reaches a
    // screen only through `--help`, never at boot, which is the whole reason
    // the lede sits above the boot as a comment instead of inside it.
    expect(header('0.1.0').map((line) => line.kind)).toEqual(['blank', 'art', 'text'])
  })
})
