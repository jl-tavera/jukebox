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

/**
 * Whether a family is loaded and available to draw with.
 *
 * This is the honest form of a question that was first asked in pixels and
 * should not have been. A pinned row width does catch a face being swapped for
 * another -- but it also catches Chromium laying text out differently on Linux
 * than on Windows, which it does: the same page, the same font, the same size,
 * and 33.5px between them at 1440, because the two platforms apply
 * `letter-spacing` to the run differently. A number that moves for a reason
 * unrelated to what it is watching is a number that gets its tolerance widened
 * until it watches nothing.
 *
 * It is also the weaker question of the two even where it works. Monospace
 * faces cluster around a 0.6em advance -- Monaspace, Liberation Mono and DejaVu
 * Sans Mono are within a percent of each other -- so a width can be right to
 * the pixel while a different font draws it. Asking the font set directly
 * discriminates what arithmetic on advances cannot.
 */
export const faceLoaded = (page: Page, family: string): Promise<boolean> =>
  page.evaluate((name) => document.fonts.check(`16px "${name}"`), family)

/**
 * The touch target, and the second place this number is written.
 *
 * `globals.css` has it as `--target`, because a stylesheet cannot import one of
 * these and a custom property cannot be read from here without a paint. The two
 * must agree, and this comment is the only thing saying so -- which is the same
 * arrangement `WIDTHS` has with `playwright.config.ts` and is accepted for the
 * same reason: one of them is measured against the page, so a disagreement
 * fails rather than hides.
 */
export const TARGET = 44

/** The scrollback. The only `<main>` the page has, and what #84 replays. */
export const SESSION = 'main.u-session'

/** The live prompt's field. The only `<input>` the page has. */
export const FIELD = 'input.u-input'

/** A word the cursor can land on. */
export const WORD = '.u-word'

/**
 * One row of the session, and the only thing on the page that is visible
 * content rather than frame.
 *
 * `theme.spec.ts` counts these to say *before anything had been parsed*: a
 * document with no rows in it is a document with nothing on screen to have
 * flashed the wrong colour.
 */
export const ROW = '.u-row'

/**
 * The page, without waiting on a font.
 *
 * `open` above awaits `document.fonts.ready` inside `page.evaluate`, which is
 * exactly right for measuring the wordmark and impossible for a case that runs
 * with JavaScript disabled. This is the same navigation with nothing that needs
 * a script to run.
 */
export const served = async (page: Page): Promise<void> => {
  await page.goto('/')
}

/** Type a command at the prompt and run it. */
export const enter = async (page: Page, command: string): Promise<void> => {
  await page.fill(FIELD, command)
  await page.press(FIELD, 'Enter')
}

/**
 * Every element matching `selector` whose tap area does not cover `size`.
 *
 * **This hit-tests rather than measuring a box, and it has to.** The horizontal
 * half of a `.u-word`'s target is a `::before` -- `globals.css` explains why it
 * cannot be padding -- and `boundingBox()` cannot see a pseudo-element at all,
 * so a box-measuring version of this would report the bare word's width and
 * fail a target that is in fact fine. Nine `elementFromPoint` probes across a
 * `size` square ask the question a finger asks: press here, and does this
 * element answer?
 *
 * **The question is asked in two halves, and it has to be.** *Extent*: is the
 * element at least `size` in each direction -- reading height off its own box
 * and width off the `::before`, since that is where a short word's horizontal
 * reach lives and `getBoundingClientRect` cannot see it. *Ownership*: does the
 * element actually answer a press inside that region, rather than something
 * painted over it.
 *
 * Splitting them is what makes the answer trustworthy at a boundary. Landable
 * rows tile exactly -- measured: a word's box is 44px and the next word's box
 * begins precisely where it ends -- and within about a pixel of that seam
 * Chromium's hit testing will name either neighbour, depending on where a
 * fractional scroll offset happened to land. Probing the seam therefore
 * measures rounding rather than the page. Demanding the element win there would
 * amount to demanding a gap between adjacent targets, which is the arrangement
 * this design deliberately rejected: overlapping targets run the wrong command,
 * and separated ones leave dead strips between them.
 *
 * So the probes sit two pixels inside and the extent check covers the rest. A
 * target that shrank would fail the first half; one that got buried would fail
 * the second. Neither can hide behind the other.
 *
 * Returns the text of everything that failed, so a failure names the word
 * rather than a count.
 */
export const undersized = (page: Page, selector: string, size = TARGET): Promise<string[]> =>
  page.evaluate(
    ({ selector: match, size: side }) => {
      const failures: string[] = []

      for (const element of document.querySelectorAll(match)) {
        element.scrollIntoView({ block: 'center' })

        const box = element.getBoundingClientRect()
        const name = element.textContent === '' ? '(no text)' : (element.textContent ?? '(no text)')

        // Extent first, ownership second -- the two halves of the question.
        // Height is the element's own box. Width has to allow for the
        // `::before`, which is where a short word's horizontal reach lives and
        // which `getBoundingClientRect` does not include.
        const reachable = Math.max(
          box.width,
          Number.parseFloat(getComputedStyle(element, '::before').width) || 0,
        )

        if (box.height + 0.5 < side) {
          failures.push(`${name} is ${box.height.toFixed(1)}px tall`)
          continue
        }

        if (reachable + 0.5 < side) {
          failures.push(`${name} reaches ${reachable.toFixed(1)}px across`)
          continue
        }

        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        const reach = side / 2 - 2

        const covered = [
          [x, y],
          [x - reach, y],
          [x + reach, y],
          [x, y - reach],
          [x, y + reach],
          [x - reach, y - reach],
          [x + reach, y - reach],
          [x - reach, y + reach],
          [x + reach, y + reach],
        ].every(([probeX, probeY]) => {
          const hit = document.elementFromPoint(probeX!, probeY!)
          return hit !== null && (hit === element || element.contains(hit))
        })

        if (!covered) failures.push(`${name} does not answer across its own box`)
      }

      return failures
    },
    { selector, size },
  )

/** A colour as the browser resolved it. */
export type Rgb = readonly [number, number, number]

/** What an element is painted in: its own colour, and the ground behind it. */
export type Paint = { readonly color: Rgb; readonly background: Rgb }

/**
 * What one element actually looks like right now.
 *
 * The background walks up the tree until it finds something opaque, because a
 * word at rest declares no background of its own and the answer that matters is
 * what a reader sees behind it. Read after a hover or a focus, this is what
 * makes "focus and hover are visually distinct" a measurement rather than an
 * opinion.
 */
export const painted = (page: Page, selector: string): Promise<Paint> =>
  page.evaluate((match) => {
    const element = document.querySelector(match)
    if (element === null) throw new Error(`nothing matches ${match} on the page`)

    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('no 2d context to resolve a colour with')

    // **The browser does the conversion, because reading the numbers out of the
    // string does not survive the syntax.** Chromium serialises the hover wash
    // -- a `color-mix` -- as `oklab(0.807 -0.011 0.162)`, and a regex over that
    // parses a lightness of 0.8 as 0.8 units of red. It answered a contrast
    // ratio of 1.07 for black on yellow, which is the kind of wrong that looks
    // like a finding. Painting the value and reading the pixel back is correct
    // for every colour syntax there will ever be.
    const resolve = (value: string): [number, number, number, number] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = '#000'
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const painted = context.getImageData(0, 0, 1, 1).data
      return [painted[0]!, painted[1]!, painted[2]!, painted[3]!]
    }

    let behind: Element | null = element
    let ground: [number, number, number, number] = [255, 255, 255, 255]
    while (behind !== null) {
      const candidate = resolve(getComputedStyle(behind).backgroundColor)
      if (candidate[3] > 250) {
        ground = candidate
        break
      }
      behind = behind.parentElement
    }

    const front = resolve(getComputedStyle(element).color)

    return {
      color: [front[0], front[1], front[2]],
      background: [ground[0], ground[1], ground[2]],
    }
  }, selector)

const channel = (value: number): number => {
  const part = value / 255
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
}

const luminance = ([red, green, blue]: Rgb): number =>
  0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)

/** WCAG's contrast ratio, so `SITE.md` 06's 4.5:1 row can be a number. */
export const contrast = ({ color, background }: Paint): number => {
  const [lighter, darker] = [luminance(color), luminance(background)].sort((a, b) => b - a)
  return (lighter! + 0.05) / (darker! + 0.05)
}
