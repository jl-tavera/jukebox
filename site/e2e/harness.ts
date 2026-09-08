import { expect, type Page } from '@playwright/test'

/**
 * What every case in this directory needs before it can measure anything.
 *
 * Kept as plain functions rather than Playwright fixtures on purpose. A fixture
 * is worth its indirection when it owns a lifecycle -- something to set up and
 * tear down -- and none of these do. They are a handful of questions about a
 * painted page, and a later ticket adding one more should be able to add a
 * function here without learning a fixture graph first.
 *
 * **#112 rewrote this file against a terminal emulator.** Everything here used
 * to address a renderer the site owned: a `<pre>` holding the art, an `<input>`
 * carrying the line, a `<main>` of `.u-row`s that grew until the document
 * scrolled. None of those exist now. The emulator owns its own grid, its own
 * input and its own overflow, so the questions are the same and every one of
 * them is asked somewhere else.
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
 * The emulator's own vocabulary, and the reason it is spelled here.
 *
 * These are `@wterm/dom`'s class names rather than this page's. They are read
 * out of `@wterm/dom/src/terminal.css` and `dist/renderer.js` rather than
 * guessed, and #114 records that the renderer is pre-1.0 -- which makes this
 * block the whole of what a renderer upgrade costs this directory. A spec that
 * spelled `.term-row` inline would spread that cost across six files.
 */
export const TERMINAL = '.wterm'

/** One row of the grid, and what this page has instead of `.u-row`. */
export const ROW = '.term-row'

/**
 * One painted block cell.
 *
 * `@wterm/dom` intercepts U+2580-U+259F before any text run is flushed and
 * emits an **empty** span painted with a `linear-gradient` in a `1ch` box, so
 * the font is never asked for a block glyph. Two consequences the whole of
 * `wordmark.spec.ts` rests on: the art never appears in `textContent`, and it
 * can only be measured as geometry.
 */
export const BLOCK = '.term-block'

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

/** The pinned block outside the terminal: the chip row, and what holds it. */
export const STATUS = '.u-status'

/** A word the cursor can land on. Since #112 the page has these only as chips. */
export const WORD = '.u-word'

/**
 * One chip.
 *
 * A `.u-word` inside the row rather than a class of its own, which is what
 * `globals.css` styles it as. The page has one landable control and #89 did not
 * add a second -- a chip is that word with a face and a box of its own, so a
 * selector naming a new class here would claim a distinction the stylesheet
 * does not make.
 */
export const CHIP = '.u-chips .u-word'

/**
 * What bash draws when it is ready for a line.
 *
 * Counting these is how every wait in this file knows a command has finished: a
 * prompt is drawn when one returns, so one more prompt than before is the shell
 * coming back.
 *
 * **A pattern rather than a literal since #113, and the reason is `cd`.** This
 * was the fixed string `user@wterm:/$`, which worked while the shell had an
 * empty filesystem and could never leave `/`. There is a Library to walk into
 * now, and the adapter's prompt carries the working directory -- `/home/user`
 * rendered as `~`, and `~/Music/Jukebox/Late Shift` in full once a visitor
 * descends. A literal would stop matching at the first `cd`.
 *
 * Neither failure announces itself, which is what makes this worth a paragraph:
 * every wait here polls for *one more* prompt, so a spelling that stopped
 * matching times each case out at thirty seconds rather than reporting a wrong
 * prompt. #112 lost fifty-four cases that way.
 *
 * `[^$]*` is what allows a Playlist folder with a space in its name, and it
 * cannot run past the prompt's own `$` because that is the one character it
 * excludes. No path this page seeds contains one.
 */
const PROMPT = /user@wterm:[^$]*\$/g

/** Every row of the grid, as text. Blocks are empty spans, so the art is not in it. */
export const screenText = (page: Page): Promise<string> =>
  page.evaluate(
    (row) => [...document.querySelectorAll(row)].map((line) => line.textContent ?? '').join('\n'),
    ROW,
  )

/** How many times the shell has offered to take a line. */
const prompts = async (page: Page): Promise<number> =>
  ((await screenText(page)).match(PROMPT) ?? []).length

/**
 * The page, painted, with both faces applied **and the shell actually up**.
 *
 * **Awaiting `document.fonts.ready` is not politeness, it is the whole
 * measurement.** `globals.css` sets `font-display: block`, which means the
 * wordmark deliberately holds its paint until Monaspace arrives rather than
 * flashing a fallback with different metrics. A measurement taken before that
 * promise settles reads either nothing or the fallback -- so a harness built to
 * catch a fallback would be reading one and calling it correct.
 *
 * **Waiting for the prompt is #112's addition, and it is not optional.**
 * `BashShell.attach()` is a promise and the emulator boots WebAssembly behind
 * it, so before it resolves the page is a mounted terminal with nothing in it.
 * The version of this function that waited only on the font left every spec
 * racing the greeting, which is exactly how this directory came to fail
 * fifty-four cases on a thirty-second timeout apiece.
 */
export const open = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  await expect
    .poll(() => prompts(page), { message: 'the shell never drew a prompt' })
    .toBeGreaterThan(0)
}

/**
 * Type a command at the prompt and run it, then wait for the shell to come back.
 *
 * **Typed rather than filled, and it has to be.** The emulator's only input is
 * an `aria-hidden` textarea it consumes keystrokes from; there is no field with
 * a value to set, so `page.fill` waits forever on a selector that will never
 * match. Clicking the terminal first is what a visitor does and what gives the
 * textarea focus.
 *
 * **And awaited rather than assumed.** The reducer this replaced had already
 * run by the time `Enter` returned, so the old version of this could read the
 * DOM immediately. A command now runs inside bash and returns when it returns,
 * so what makes the next assertion safe is one more prompt than there was.
 */
export const enter = async (page: Page, command: string): Promise<void> => {
  const before = await prompts(page)

  await page.locator(TERMINAL).click({ position: { x: 2, y: 2 } })
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')

  await expect
    .poll(() => prompts(page), { message: `the shell never came back from ${command}` })
    .toBeGreaterThan(before)
}

/**
 * Which columns of the grid each row of art is painted on.
 *
 * **This is the check that replaced measuring row widths, and the reason is
 * mechanical.** The old one ran a `Range` over the art's text node and required
 * the five rows to come out the same width, which caught a face that carried
 * some Block Elements and not others -- the missing ones arriving from the next
 * font in the stack at a different advance. `@wterm/dom` paints those cells
 * instead of typesetting them, so there is no text node to range over and no
 * glyph to be missing. That failure is gone rather than unwatched.
 *
 * What can still go wrong is the lattice: a row dropped, a row shifted, a row
 * wrapped because the grid was narrower than the art, or a column count that is
 * not the art's. All four are visible as the set of columns each row's blocks
 * land on, which is what this returns -- rows with no art in them omitted, so
 * the greeting's prose and the prompt do not have to be skipped by the caller.
 *
 * Columns rather than pixels, because a column is what `WORDMARK` is written in.
 * The cell width is read off a block's own box -- `.term-block` is `1ch` -- so
 * this stays correct at every one of the three viewports without a table of
 * sizes to keep in step with the stylesheet.
 */
export const lattice = (page: Page): Promise<number[][]> =>
  page.evaluate(
    ({ row, block }) =>
      [...document.querySelectorAll(row)]
        .map((line) => {
          const blocks = [...line.querySelectorAll(block)]
          if (blocks.length === 0) return []

          const cell = blocks[0]!.getBoundingClientRect().width
          if (cell === 0) throw new Error('a block cell measured zero wide; the grid never painted')

          const left = line.getBoundingClientRect().left

          return blocks.map((box) => Math.round((box.getBoundingClientRect().left - left) / cell))
        })
        .filter((columns) => columns.length > 0),
    { row: ROW, block: BLOCK },
  )

/**
 * Whether the page scrolls sideways.
 *
 * Read off the document element rather than the body: the terminal is
 * full-bleed and `body` has no width of its own to overflow.
 */
export const scrollsHorizontally = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

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
 * Sans Mono are within a percent of each other -- so a width can be right to the
 * pixel while a different font draws it. Asking the font set directly
 * discriminates what arithmetic on advances cannot.
 */
export const faceLoaded = (page: Page, family: string): Promise<boolean> =>
  page.evaluate((name) => document.fonts.check(`16px "${name}"`), family)

/**
 * What the page put on the clipboard.
 *
 * **The seam that had to move.** `install` copying its command was checked in
 * jsdom by capturing the argument to `clipboard.writeText`, and #112 deleted
 * that layer along with the component it tested. It is an acceptance criterion,
 * so it is asked here instead -- of a real clipboard, in a real browser, which
 * is now the only place that can answer it.
 *
 * Needs `clipboard-read` granted by the caller; `install.spec.ts` is the only
 * consumer and does it there rather than widening every context in this suite.
 */
export const clipboardText = (page: Page): Promise<string> =>
  page.evaluate(() => navigator.clipboard.readText())

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

/**
 * Whether an element is inside the viewport, top and bottom.
 *
 * **Read with `getBoundingClientRect` in the page rather than with Playwright's
 * `boundingBox()`**, which answers in the main frame's coordinates -- the
 * question here is where something sits relative to what is on screen right
 * now, which is the one thing a scroll offset changes and the other reading
 * does not.
 *
 * #89 asks that the chip row be visible *at every scroll position*. Since #112
 * the document does not scroll at all -- the emulator owns its overflow -- so
 * what this now holds is the weaker, still-real claim that the row is on screen
 * with a long session behind it.
 */
export const onScreen = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((match) => {
    const element = document.querySelector(match)
    if (element === null) throw new Error(`nothing matches ${match} on the page`)

    const box = element.getBoundingClientRect()

    return box.top >= 0 && box.bottom <= window.innerHeight && box.height > 0
  }, selector)

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
