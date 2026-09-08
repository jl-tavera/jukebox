import { expect, test, type Page } from '@playwright/test'
import { WORDMARK } from '../lib/content'
import { faceLoaded, lattice, open, screenText, scrollsHorizontally, WIDTHS } from './harness'

/**
 * The wordmark, measured rather than looked at.
 *
 * **#112 changed the failure this file watches for, and the change is not a
 * loosening.** `SITE.md` 03 was written about shear: the art is built from
 * spaces and Block Elements, and a face carrying some of those glyphs and not
 * others sends the missing ones to the next font in the stack at a different
 * advance, so the rows stop being the same length and the letterforms come
 * apart. `@wterm/dom` ends that failure rather than surviving it -- it
 * intercepts U+2580-U+259F before any run is flushed and paints each cell as a
 * CSS gradient in a `1ch` box, so the font is never asked for a block glyph and
 * a face that dropped the whole table cannot shear anything.
 *
 * What can still go wrong is the lattice. The art is five rows of sixty-seven
 * columns and the blocks have to land on the columns `WORDMARK` puts them on --
 * a row dropped, a row shifted, a row wrapped because the grid was narrower
 * than the art, or a column count that is not the art's are all still reachable,
 * and all of them are invisible on the machine that built the page. That is
 * what is measured here.
 *
 * **Everything checkable without pixels is checked without pixels, and none of
 * it is repeated here.** That the art is five rows of sixty-seven columns, and
 * that it contains nothing but spaces and Block Elements, is enforced by
 * `cli/scripts/generate-wordmark.ts` when the art is generated, with CI
 * regenerating and diffing. That the shipped faces still carry every one of
 * those code points after subsetting is enforced by `site/scripts/check-fonts.ts`
 * against the built export -- which still earns its keep for a consumer this
 * page no longer is, since `cli/src/header.ts` draws the same art in a real
 * terminal from the same vendored face. That `greeting` picks the right branch
 * for a column count is `test/shell.test.ts`. This file asks the one question
 * none of them can reach: what the emulator actually painted, and where.
 */

/**
 * The face the page actually draws, under the name `globals.css` declares it.
 *
 * **Neon alone, and the missing one is a finding rather than an oversight.**
 * `globals.css` declares Argon too and `check-fonts.ts` proves the export ships
 * it, but a browser fetches a webfont when something needs it to paint and
 * nothing on this page does any more: the tagline and the lede were the human's
 * voice in Argon, and since #112 they are rows inside a terminal that draws
 * every cell in one family. `document.fonts` reports Argon `unloaded` on a
 * fully painted page, so asserting it here would fail for telling the truth.
 *
 * The chip row looks like the remaining consumer and is not one. Its buttons
 * carry `u-prose`, but `.u-word` sets the `font` shorthand to `inherit` from
 * the same layer at equal specificity and later in source order, so the family
 * is reset before it lands -- which predates this ticket and is unchanged by it.
 */
const FACES = ['Monaspace Neon'] as const

/** Every Block Element, which is the whole alphabet the art is drawn in. */
const BLOCKS = /[▀-▟]/u

/**
 * Which columns each row of the source puts a block on.
 *
 * Derived from `WORDMARK` rather than written out, because a table of numbers
 * this long is a table nobody checks -- and the art is generated, so a literal
 * here would be a second copy of it going stale the first time it changes. The
 * leading newline the template literal carries is dropped, which is what makes
 * this five rows rather than six.
 */
const EXPECTED = WORDMARK.split('\n')
  .filter((line) => line.length > 0)
  .map((line) => [...line].flatMap((glyph, column) => (BLOCKS.test(glyph) ? [column] : [])))

/**
 * Whether the grid at this viewport is wide enough to be shown the art.
 *
 * `greeting` prints the mark only where the column count clears its natural
 * width and a plain version line everywhere else, so at 375 there is no art to
 * measure and its absence is the assertion. Written as a table against `WIDTHS`
 * for `SIZES`' old reason: adding a fourth project without deciding which side
 * of the threshold it falls on is a compile error here rather than a case that
 * quietly never ran.
 *
 * Measured: 375 resolves to 44 columns, 768 to 84 and 1440 to 152, against an
 * art sixty-seven wide.
 */
const WIDE: Record<(typeof WIDTHS)[number], boolean> = {
  375: false,
  768: true,
  1440: true,
}

const wide = (page: Page): boolean => WIDE[page.viewportSize()!.width as (typeof WIDTHS)[number]]

test.describe('the wordmark', () => {
  test('paints every row on the columns the source puts it on', async ({ page }) => {
    test.skip(!wide(page), 'this grid gets the version line instead')

    await open(page)

    const painted = await lattice(page)

    // The row count first, because it is what the equality below cannot see. A
    // list of four rows that each match their counterpart still matches, so
    // without this a render that dropped the fifth would leave this green.
    expect(painted).toHaveLength(EXPECTED.length)

    // Then the lattice itself, exactly. Every glyph in this face has the same
    // advance and the cell is read off a block's own `1ch` box, so a column
    // index is arithmetic rather than a measurement with a tolerance -- and it
    // came out identical to the source at both wide viewports.
    expect(painted).toEqual(EXPECTED)
  })

  test('prints a version line instead, where the grid is too narrow', async ({ page }) => {
    test.skip(wide(page), 'this grid is wide enough for the art')

    await open(page)

    // **The case that caught the bug this ticket shipped with.** `wt.cols` is
    // the emulator's default of 80 until its own `ResizeObserver` has delivered,
    // and 80 clears the art's natural width -- so the greeting was composed for
    // a wide grid on every viewport and then truncated when the real one turned
    // out to be 44 columns. A phone got five rows of art cut off mid-letter at
    // column 43. `live.tsx` now waits for the measurement.
    expect(await lattice(page)).toEqual([])
    expect(await screenText(page)).toContain('jukebox')
  })

  test('renders in the faces this repo ships', async ({ page }) => {
    await open(page)

    // The art is painted rather than typeset now, so this no longer guards the
    // wordmark -- it guards everything around it. The prose, the menu and the
    // prompt are all still glyphs, and a whole-face substitution is the one
    // failure a lattice of gradient boxes cannot see.
    for (const face of FACES) {
      expect(await faceLoaded(page, face), `${face} did not load`).toBe(true)
    }
  })

  test('never scrolls sideways', async ({ page }) => {
    await open(page)

    // `SITE.md` 06's responsive row. The art is the widest thing on the page by
    // a distance wherever it appears, so if anything overflows it is this.
    expect(await scrollsHorizontally(page)).toBe(false)
  })

  /**
   * The first assertion above, shown failing.
   *
   * An equality check that has never been seen to go red is a claim rather than
   * a check, and this one guards a failure nobody can see by looking. The
   * original spec proved its point by serving a face stripped of Block
   * Elements; that fixture no longer reproduces anything, because a painted
   * cell does not consult the font.
   *
   * So the grid is taken below the art instead, which is the condition the
   * lattice actually protects against. The greeting is composed once, against
   * the width measured at boot -- a window narrowed afterwards reflows the
   * scrollback under art that was already written, and the emulator has no way
   * to put back what no longer fits. Measured: sixty-seven columns become fifty,
   * and every row loses between a quarter and a third of its blocks.
   */
  test('loses the lattice when the grid is taken below the art', async ({ page }) => {
    test.skip(!wide(page), 'this grid never had the art to lose')

    await open(page)
    expect(await lattice(page)).toEqual(EXPECTED)

    await page.setViewportSize({ width: 420, height: 900 })

    await expect
      .poll(() => lattice(page), { message: 'the art survived a grid it does not fit' })
      .not.toEqual(EXPECTED)
  })
})
