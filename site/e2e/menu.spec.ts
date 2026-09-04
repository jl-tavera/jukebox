import { expect, test, type Page } from '@playwright/test'
import { CLI_COMMANDS, CLI_VERSION, MENU_ENTRIES } from '../lib/content'
import { versionLine } from '../lib/session/header'
import { BAR, BAR_END, RADIO_INACTIVE } from '../lib/session/select'
import { enter, open, scrollsHorizontally, SESSION, TARGET } from './harness'

/**
 * The menu, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary is as tight here as in `boot.spec.ts`. What the
 * frame contains, where the hint goes, which row the cursor lands on, what an
 * entry launches -- all of it is a pure function of state, answered in
 * `test/select.test.ts` and `test/terminal.test.ts` with no browser in the
 * room. Whether a key reaches the reducer is `wiring/`.
 *
 * **What is left is what only a browser has: a laid-out row, a resolved
 * decoration and a real notion of what is focused.** The first is the one that
 * matters most, and it is the reason #86 left the rows as text: the tap target
 * a landable word carries is real padding, so making the rows controls would
 * grow each of them from one line to 44px and pull the rail apart into a dotted
 * column. That is a decision no unit test can hold, and this is where it is
 * held.
 *
 * **That decision contradicts #79 in writing, and the contradiction is recorded
 * rather than hidden in this file.** Its seam 3 list asks that *every chip, menu
 * row and copy control meets a 44px touch target*, and the first case below
 * asserts the opposite for the menu's rows. It cannot have both: the same list
 * asks for the rail's shape, and one more row of it asks `--dim` to clear 4.5:1
 * over the hover wash, which `globals.css` measured as having no headroom in the
 * light theme -- so landable rows would cost the rail's continuity *and* the
 * library's dim labels. The deviation and its reasoning are on #79 itself, and
 * #92 carries it into the document; #89's chips are the page's touch path and
 * meet the floor as specified.
 *
 * The default here is `reducedMotion: 'reduce'` from `playwright.config.ts`, so
 * every case below meets the page at rest with the menu open -- which is where
 * a visitor who declined the animation meets it too.
 */

/** Every row of the session, with its height and its text. */
const laidOut = (page: Page): Promise<{ text: string; height: number }[]> =>
  page.evaluate(
    (session) =>
      [...document.querySelectorAll(`${session} .u-row`)].map((row) => ({
        text: row.textContent ?? '',
        height: row.getBoundingClientRect().height,
      })),
    SESSION,
  )

test.describe('the rail', () => {
  test('is drawn on rows one line tall, so it reads as a column', async ({ page }) => {
    await open(page)

    const rows = await laidOut(page)

    // The version line is a short row of ordinary text: it cannot wrap at any
    // width this suite runs, so its height is one line of the grid.
    const line = rows.find((row) => row.text === versionLine(CLI_VERSION))?.height
    expect(line, 'the version line was not on screen').toBeDefined()

    // The rows the rail is drawn on that cannot wrap either: the bare glyph it
    // opens with, the corner it closes on, and the entries carrying no hint.
    // Whether the row with the hint wraps is the viewport's business and the
    // CLI's own rule; whether these are padded is this project's.
    const unwrappable = rows.filter(
      (row) =>
        row.text === BAR ||
        row.text === BAR_END ||
        MENU_ENTRIES.some((entry) => row.text === `${BAR}  \u25CB ${entry.label}`),
    )

    expect(unwrappable.length).toBeGreaterThan(MENU_ENTRIES.length)

    for (const row of unwrappable) {
      expect(row.height, `\`${row.text}\` is not one line tall`).toBeCloseTo(line!, 0)
    }

    // Said the other way round, because the number is the point: a landable row
    // would be 44px, and a rail drawn down the middle of those has gaps in it
    // twice the height of the glyph.
    expect(line).toBeLessThan(TARGET)
  })

  test('never pushes the page sideways, hint and all', async ({ page }) => {
    // The longest row the frame can draw is the longest hint, sitting on the
    // active row. Found rather than counted to, so reordering the menu moves
    // this case with it instead of leaving it measuring the wrong row.
    const longest = MENU_ENTRIES.reduce((widest, entry) =>
      entry.hint.length > widest.hint.length ? entry : widest,
    )

    await open(page)

    // Reached the way a visitor reaches it, from the row the boot leaves the
    // cursor on.
    for (let at = MENU_ENTRIES.indexOf(longest); at > 0; at--) {
      await page.keyboard.press('ArrowDown')
    }

    await expect(page.locator(SESSION)).toContainText(longest.hint)
    expect(await scrollsHorizontally(page)).toBe(false)
  })
})

test.describe('a question walked away from', () => {
  test('is struck through, which is the shape the colour is not', async ({ page }) => {
    // The library strikes the value a cancelled step was standing on and paints
    // the mark red. The red is gone, for the reason every colour on this page is
    // gone, and the strikethrough is what is left carrying the difference -- so
    // it has to actually resolve, rather than be a class nobody styled.
    await open(page)
    await enter(page, 'help')

    const struck = await page.evaluate(
      (session) =>
        [...document.querySelectorAll(`${session} span`)]
          .filter((span) => getComputedStyle(span).textDecorationLine.includes('line-through'))
          .map((span) => span.textContent ?? ''),
      SESSION,
    )

    expect(struck).toEqual([MENU_ENTRIES[0]!.label])
  })
})

test.describe('the legend, answered', () => {
  test('down and Enter reach it before anything has been clicked', async ({ page }) => {
    // The gesture the frame's own footer advertises, performed on a page nobody
    // has touched -- which is the state a visitor arrives in, and the one no
    // other seam has a real answer for: jsdom's idea of what is focused is a
    // stub, and this is the browser's.
    await open(page)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // What the second entry launches, in the words `content.ts` owns rather
    // than a copy of them made here.
    const launched = CLI_COMMANDS.find((command) => command.name === MENU_ENTRIES[1]!.label)

    await expect(page.locator(SESSION)).toContainText(launched!.summary)
  })
})
