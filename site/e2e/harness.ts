import type { Page } from '@playwright/test'

/**
 * What every case in this directory needs before it can measure anything.
 *
 * Kept as plain functions rather than Playwright fixtures on purpose. A fixture
 * is worth its indirection when it owns a lifecycle -- something to set up and
 * tear down -- and none of these do. They are a handful of questions about a
 * painted page, and a later ticket adding one more should be able to add a
 * function here without learning a fixture graph first.
 */

/**
 * The widths this page is held to, and the one place they are written.
 *
 * `SITE.md` 06's responsive row names them. `playwright.config.ts` turns each
 * into a project, so every spec in this directory runs at all three without
 * saying so, and `wordmark.spec.ts` types its measurements against this rather
 * than repeating the numbers -- which is what makes adding a fourth width a
 * compile error in the one place that would have to answer for it, rather than
 * a passing test that quietly never ran.
 */
export const WIDTHS = [375, 768, 1440] as const

/**
 * The wordmark, as a selector.
 *
 * One string rather than three lookups written three ways. The art is the only
 * `<pre>` on the page and `components/screen.tsx` is the only thing that emits
 * one, so this is as stable as a test id would be and does not ask the renderer
 * to carry an attribute that exists only for tests -- which is why there is no
 * test id anywhere in this repo.
 */
const ART = 'pre.u-art'

/**
 * The page, painted, with both faces actually applied.
 *
 * **Awaiting `document.fonts.ready` is not politeness, it is the whole
 * measurement.** `globals.css` sets `font-display: block`, which means the
 * wordmark deliberately holds its paint until Monaspace arrives rather than
 * flashing a fallback with different metrics. A measurement taken before that
 * promise settles reads either nothing or the fallback -- so a harness built to
 * catch a fallback would be reading one and calling it correct.
 */
export const open = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

/**
 * The rendered width of each row of the wordmark.
 *
 * **Measured with a `Range`, and it has to be.** The art is one `<pre>` holding
 * a single text node with four newlines in it -- `components/screen.tsx` passes
 * `line.text` as one JSX child -- so there are no per-row elements whose
 * `getBoundingClientRect` could be read. A `Range` over that text node is what
 * gives each line its own box.
 *
 * Two ways of getting this wrong, both of them found the hard way while #81 was
 * being verified, and both silent:
 *
 * - Building a probe element and copying `getComputedStyle(art).cssText` onto
 *   it drags the art's own resolved `width` along with everything else, so the
 *   probe reports the container rather than the text. It answered 623.1px where
 *   the real figure was 988.25px, and it answered it five times identically --
 *   which is to say it would have passed this ticket's assertion while
 *   measuring nothing at all.
 * - Asking a browser to resize its window is not the same as setting a
 *   viewport. A resize that silently does not take leaves every case measuring
 *   one width three times and agreeing with itself. Playwright sets the
 *   viewport at context creation rather than by asking, so the hazard does not
 *   arise here -- but `artFontSize` below is what proves it in each case rather
 *   than assuming it.
 */
export const artRowWidths = (page: Page, selector = ART): Promise<number[]> =>
  page.evaluate((art) => {
    const pre = document.querySelector(art)
    if (pre === null) throw new Error(`nothing matches ${art} on the page`)

    const node = pre.firstChild
    if (node === null || node.nodeType !== Node.TEXT_NODE) {
      throw new Error('the art is not a single text node; the renderer changed shape')
    }

    // Every line, including any that is empty. Skipping blanks would make the
    // count the caller checks depend on what the art happens to contain, and a
    // row that arrived empty is exactly the change worth failing on.
    return (node.textContent ?? '').split('\n').map((line, index, lines) => {
      const offset = lines.slice(0, index).reduce((at, before) => at + before.length + 1, 0)

      const range = document.createRange()
      range.setStart(node, offset)
      range.setEnd(node, offset + line.length)

      return range.getBoundingClientRect().width
    })
  }, selector)

/** How far apart the widest and narrowest rows are. Zero is the wordmark holding. */
export const spread = (widths: readonly number[]): number =>
  Math.max(...widths) - Math.min(...widths)

/**
 * Whether the page scrolls sideways.
 *
 * Read off the document element rather than the body: the session is full-bleed
 * and `body` has no width of its own to overflow.
 */
export const scrollsHorizontally = (page: Page): Promise<boolean> =>
  page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )

// No locator helper here. One was written for `getByRole('img', { name: ART_LABEL })`
// and deleted before it shipped: nothing needed it, and SITE.md 07 deletes a
// thing with no consumer rather than keeping it as a reservation. The role and
// the label are still the right way to reach the art, and the ticket that first
// needs one can add it back in three lines.

/**
 * The size the art actually resolved to.
 *
 * Asserted by every case that pins a width, as the guard that the viewport is
 * the one the project asked for. `window.innerWidth` would be the obvious thing
 * to check and is the wrong one: a classic scrollbar subtracts from it, so the
 * day this page grows past one screen at 375 the check would fail for a reason
 * that has nothing to do with what it was watching.
 *
 * This is exact instead, and it is downstream of the viewport by construction --
 * `.u-art` is sized `clamp(5px, 2vw, 25px)`, so the number can only be right if
 * the width is.
 */
export const artFontSize = (page: Page, selector = ART): Promise<string> =>
  page.evaluate((art) => {
    const pre = document.querySelector(art)
    if (pre === null) throw new Error(`nothing matches ${art} on the page`)

    return getComputedStyle(pre).fontSize
  }, selector)
