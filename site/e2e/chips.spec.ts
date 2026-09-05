import { expect, test, type Page } from '@playwright/test'
import {
  CHIP,
  FIELD,
  onScreen,
  open,
  painted,
  scrollable,
  scrollsHorizontally,
  SESSION,
  STATUS,
  TARGET,
  undersized,
} from './harness'

/**
 * The status line, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary holds here as everywhere. *Which* verbs belong
 * on the row, what each of them prints, and that none of them is the binary's
 * are answered in `test/commands.test.ts` with no browser in the room; that the
 * component drew what it was handed and moved focus where it should is
 * `wiring/`. **What is left needs pixels**: a row that has to stay on screen
 * while the page scrolls under it, a 44px target measured rather than
 * eyeballed, and a focus state distinguishable from a hover.
 *
 * `prompt.spec.ts` already sweeps `body *` for a border, a radius or a shadow,
 * so *chips render as words rather than buttons* is checked there the moment
 * this row exists -- one sweep over the page beats a second one naming a class.
 *
 * **Three cases were written here and deleted before they shipped**, and what
 * they were is worth recording rather than quietly dropping: which words the
 * row carries, that tapping one runs it, and that tapping one leaves focus
 * alone. Every one is answered without a browser -- the first twice over, in
 * `test/commands.test.ts` and in `wiring/live.test.tsx` -- so all three were
 * this file restating a seam below it. `shows what it printed` is what remains
 * of the second, and it earns its place by needing a scroll offset that only a
 * laid-out page has.
 */

/** A chip, by the word on it. */
const chip = (page: Page, name: string) =>
  page.locator(CHIP).filter({ hasText: new RegExp(`^${name}$`, 'u') })

/**
 * A session long enough that the document actually scrolls.
 *
 * Three listings rather than one, because the viewport is 900 tall in every
 * project and one `help` does not always overflow it. Every case about the row
 * holding its place asserts `scrollable` first, so a page that stopped
 * overflowing would fail here rather than pass everywhere.
 */
const long = async (page: Page): Promise<void> => {
  await open(page)

  for (let listing = 0; listing < 3; listing++) {
    await chip(page, 'help').click()
  }

  expect(await scrollable(page), 'the page never grew past its viewport').toBe(true)
}

test.describe('the row itself', () => {
  test('is on screen at the top of a long session', async ({ page }) => {
    await long(page)
    await page.evaluate(() => window.scrollTo({ top: 0 }))

    expect(await onScreen(page, STATUS)).toBe(true)
  })

  test('is still on screen at the bottom of it', async ({ page }) => {
    await long(page)
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }))

    expect(await onScreen(page, STATUS)).toBe(true)
  })

  test('gives every chip a target a finger can hit', async ({ page }) => {
    // The row is the one place on this page where landable words sit side by
    // side rather than stacked, so it is the arrangement that would find two
    // 44px targets overlapping each other. `undersized` hit-tests, so an
    // overlap shows up as a chip that does not answer across its own box.
    await open(page)

    expect(await undersized(page, CHIP, TARGET)).toEqual([])
  })

  test('never pushes the page sideways, the whole row and all', async ({ page }) => {
    await long(page)

    expect(await scrollsHorizontally(page)).toBe(false)
  })
})

test.describe('tapping', () => {
  test('shows what it printed, rather than leaving it under the fold', async ({ page }) => {
    // **The case that earns the pinned row its keep or costs it.** Output is
    // appended above a block that never moves, so without the page following it
    // down a chip runs, prints, and looks to a visitor like it did nothing at
    // all -- which is the whole of "operable on a phone" failing quietly.
    await long(page)

    expect(await onScreen(page, '.u-row:last-of-type')).toBe(true)
  })

  test('raises it when the terminal itself is tapped', async ({ page }) => {
    // The other half of the same criterion, and the same proxy for it: focusing
    // a text field inside a user gesture is how a page asks for a keyboard.
    // Tapped in the session's own top-left padding, which is the element itself
    // rather than any word printed on it.
    await open(page)
    await page.locator(SESSION).click({ position: { x: 2, y: 2 } })

    await expect(page.locator(FIELD)).toBeFocused()
  })
})

test.describe('a chip, focused against hovered', () => {
  test('are two different paints, and neither is the resting one', async ({ page }) => {
    // `prompt.spec.ts` asks this of a word in the scrollback. It is asked again
    // here because a chip is the first landable word with a tone class on it,
    // and a class that painted a colour of its own would break the pair without
    // touching anything that spec can see.
    await open(page)

    const first = `${CHIP}:first-of-type`
    const rest = await painted(page, first)

    await page.locator(CHIP).first().hover()
    const hover = await painted(page, `${CHIP}:hover`)

    await page.mouse.move(0, 0)

    // By keyboard, never by a click: Chromium does not apply `:focus-visible`
    // to a clicked button, so a spec that clicked would read the resting paint
    // and pass while the criterion failed.
    await page.click(FIELD)
    await page.keyboard.press('Tab')
    const focus = await painted(page, `${CHIP}:focus`)

    expect(hover.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(hover.background)

    expect(focus.color).toEqual(rest.background)
  })
})
