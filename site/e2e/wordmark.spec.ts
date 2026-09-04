import { expect, test, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import {
  WIDTHS,
  artFontSize,
  artRowWidths,
  faceLoaded,
  open,
  scrollsHorizontally,
  spread,
} from './harness'

/**
 * The wordmark, measured rather than looked at.
 *
 * `SITE.md` 03 was written about one failure and this file is what finally
 * watches for it. The art is five rows of sixty-seven columns built from
 * nothing but spaces and Block Elements. If the face in use carries some of
 * those glyphs and not others, the browser fetches the missing ones from the
 * next font in the stack -- at a different advance -- and the rows stop being
 * the same length. The letterforms shear apart.
 *
 * What makes it worth a browser is that it is invisible on the machine that
 * built the page. Whoever has Monaspace installed locally, or a system
 * monospace carrying the whole Block Elements table, sees the art intact while
 * shipping something broken. `SITE.md` 06 says it plainly: this is the one to
 * measure rather than eyeball.
 *
 * **Everything checkable without pixels is checked without pixels, and none of
 * it is repeated here.** That the art is five rows of sixty-seven columns, and
 * that it contains nothing but spaces and Block Elements, is enforced by
 * `cli/scripts/generate-wordmark.ts` when the art is generated, with CI
 * regenerating and diffing. That the shipped faces still carry every one of
 * those code points after subsetting is enforced by `site/scripts/check-fonts.ts`
 * against the built export. Those are three different questions and this file
 * asks the fourth, the only one they cannot reach: a code point present in a
 * cmap is not proof of a correct advance width.
 */

/**
 * The size the art resolves to at each viewport.
 *
 * Asserted as the guard that the viewport is the one the project asked for.
 * `.u-art` is sized `clamp(5px, 2vw, 25px)`, so the number can only be right if
 * the width is -- which makes it a better check than `window.innerWidth`, whose
 * value a scrollbar quietly changes.
 *
 * **Row widths in pixels are deliberately not pinned here, and the first
 * version of this file got that wrong.** Three widths measured in Chromium on
 * Windows failed in Chromium on Linux by 33.5px at 1440 -- the same page, the
 * same font, the same size, with the two platforms applying the `-0.03em`
 * tracking across the run differently. A number that moves for a reason
 * unrelated to what it is watching only ever gets its tolerance widened until
 * it is watching nothing.
 *
 * The property that pin was reaching for -- that the face drawing this is the
 * one this repo ships -- is asked directly below, and asked better: monospace
 * advances cluster so tightly around 0.6em that a row width can be right to the
 * pixel while a different font draws it.
 */
const SIZES: Record<(typeof WIDTHS)[number], string> = {
  375: '7.5px',
  768: '15.36px',
  1440: '25px',
}

/** Both faces, under the names `globals.css` declares them. */
const FACES = ['Monaspace Neon', 'Monaspace Argon'] as const

/**
 * How many rows the art is, as rendered.
 *
 * `cli/scripts/generate-wordmark.ts` already refuses a banner that is not five
 * rows of sixty-seven columns, so this is not that check arriving a second
 * time. That one pins the *source*; this pins what the renderer made of it, and
 * only one of the two can see a component that dropped a line on the way to the
 * page.
 *
 * It is load-bearing rather than belt-and-braces. Every other assertion here
 * reads a list of row widths and compares them to each other -- and a list of
 * one is trivially equal to itself, so a render that lost four rows would leave
 * this file green while the page showed a stripe.
 */
const ROWS = 5

/**
 * The smallest disagreement between rows worth calling a shear.
 *
 * A whole pixel, which is far below the ~15px a real fallback produces and far
 * above anything layout rounding does -- the good case measures a spread of
 * exactly zero, on both platforms this has run on.
 */
const SHEAR = 1

/**
 * A copy of Neon carrying printable ASCII and not one Block Element.
 *
 * Written by `bun run --cwd site fonts:build` into `e2e/fixtures/`, never into
 * `public/`, so it is never served and never enters the export.
 *
 * Located beside this file, via the path Playwright reports for it. Neither
 * `import.meta.url` nor `__dirname` will do: this workspace declares no
 * `"type": "module"`, so Playwright transpiles specs to CommonJS and
 * `import.meta` is a syntax error inside one, while `__dirname` would work
 * today and break the day that changes. `testInfo.file` is the spec's own
 * absolute path under either, and the fixture is its neighbour.
 */
const fixture = (specFile: string): string =>
  join(dirname(specFile), 'fixtures', 'neon-without-block-elements.woff2')

/**
 * What this project's viewport should produce.
 *
 * Keyed off the viewport Playwright actually gave the page rather than off the
 * project name, so it cannot drift from the config by a rename. `SIZES` is
 * typed against `WIDTHS`, so adding a fourth project without measuring it is a
 * compile error here rather than an undefined lookup at run time.
 */
const expected = (page: Page) => SIZES[page.viewportSize()!.width as (typeof WIDTHS)[number]]

test.describe('the wordmark', () => {
  test('renders every row at the same width', async ({ page }) => {
    await open(page)

    const widths = await artRowWidths(page)

    // Before comparing them to each other, that there are five of them. A list
    // of one is equal to itself, so without this the assertion below passes on
    // a render that lost four rows.
    expect(widths).toHaveLength(ROWS)

    // Exact rather than a tolerance, and it can be: every glyph in this face
    // has the same advance, so each row is sixty-seven of the same number and
    // the five results are the same arithmetic. Any spread at all is a glyph
    // that came from somewhere else, which is the whole failure. Measured at
    // exactly zero on both Windows and Linux.
    expect(spread(widths)).toBe(0)
  })

  test('renders in the faces this repo ships', async ({ page }) => {
    await open(page)

    // The size first, because it is what proves the viewport is the one this
    // project asked for -- `.u-art` is sized in `vw`, so a wrong width could
    // not produce a right size.
    expect(await artFontSize(page)).toBe(expected(page))

    // Then that the vendored faces actually loaded. The case above says the
    // five rows agree with each other; this says what they agree in. Without it
    // a whole-face substitution passes everything else here -- every row equally
    // wrong, in a fallback that happens to be monospace -- which is the one
    // failure equality cannot see.
    for (const face of FACES) {
      expect(await faceLoaded(page, face), `${face} did not load`).toBe(true)
    }
  })

  test('never scrolls sideways', async ({ page }) => {
    await open(page)

    // `SITE.md` 06's responsive row. The art is the widest thing on the page by
    // a distance, so if anything overflows at these widths it is this.
    expect(await scrollsHorizontally(page)).toBe(false)
  })

  /**
   * The first assertion above, shown failing.
   *
   * An equality check that has never been seen to go red is a claim rather than
   * a check, and this one guards a failure nobody can see by looking. So the
   * face is swapped for one missing exactly the glyphs the art is built from,
   * and the rows are required to disagree.
   *
   * **Serving no face at all would not reproduce it.** Aborting the request
   * sends every glyph to the same fallback, and a fallback monospace renders
   * five equal rows -- the art survives, in the wrong typeface. The failure this
   * page is exposed to is a face that carries *some* of what it needs, so the
   * simulation has to be a partial font rather than a missing one.
   */
  test('shears when the served face lacks Block Elements', async ({ page }, testInfo) => {
    await page.route('**/fonts/monaspace-neon.woff2', (route) =>
      route.fulfill({ path: fixture(testInfo.file), contentType: 'font/woff2' }),
    )

    await open(page)

    // Spaces now come from the fixture and blocks from the fallback stack, at a
    // different advance. The rows carry between nine and twenty-seven spaces
    // each, so they cannot stay equal -- and a harness that let them would be
    // measuring nothing. Measured at ~15px against a threshold of one.
    expect(spread(await artRowWidths(page))).toBeGreaterThan(SHEAR)
  })
})
