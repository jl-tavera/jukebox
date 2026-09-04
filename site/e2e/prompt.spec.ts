import { expect, test, type Page } from '@playwright/test'
import {
  contrast,
  enter,
  FIELD,
  open,
  painted,
  scrollsHorizontally,
  TARGET,
  undersized,
  WORD,
} from './harness'

/**
 * The live prompt, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary matters as much here as anywhere. Whether Tab
 * completes, what `help` lists, what the scrollback caps at -- all behaviour,
 * all answered under `bun test` with no browser. What a component does with an
 * intent is `wiring/`. **Only what needs pixels belongs here**: a hit-tested
 * touch target, a resolved colour, a contrast ratio, a page that scrolls
 * sideways. None of it is answerable in jsdom, which lays nothing out.
 */

/** The mark in front of the field. It is what focus inverts. */
const SIGIL = '.u-prompt > span'

/** The page, with the help listing on screen -- which is where the words are. */
const listed = async (page: Page): Promise<void> => {
  await open(page)
  await enter(page, 'help')
  await expect(page.locator(WORD).first()).toBeVisible()
}

test.describe('the touch targets', () => {
  test('every landable word answers across a 44px square', async ({ page }) => {
    // Measured by hit testing rather than by reading a box, because the
    // horizontal half of the target is a `::before` and `boundingBox()` cannot
    // see one. See `undersized` in the harness.
    await listed(page)

    expect(await undersized(page, WORD, TARGET)).toEqual([])
  })

  test('so does the prompt', async ({ page }) => {
    await open(page)

    expect(await undersized(page, FIELD, TARGET)).toEqual([])
  })
})

test.describe('focus against hover', () => {
  test('are two different paints, and neither is the resting one', async ({ page }) => {
    await listed(page)

    const rest = await painted(page, WORD)

    await page.locator(WORD).first().hover()
    const hover = await painted(page, `${WORD}:hover`)

    // The mouse is moved off before focus is taken, or the first word would be
    // hovered and focused at once and the two paints would not be separable.
    await page.mouse.move(0, 0)

    // Focus is reached by keyboard, **not by a click**: Chromium does not apply
    // `:focus-visible` to a clicked button, so a spec that clicked would read
    // the resting paint and pass while the criterion failed.
    await page.click(FIELD)
    await page.keyboard.press('Shift+Tab')
    const focus = await painted(page, `${WORD}:focus`)

    expect(hover.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(hover.background)

    // Focus inverts, which is the page's own indicator and what the menu
    // already draws its cursor with.
    expect(focus.color).toEqual(rest.background)
  })

  test('the prompt shows them too, in two different places', async ({ page }) => {
    // The field is the page's primary control and has its own pair of states:
    // hover washes the field, focus inverts the sigil beside it. Two elements
    // and two mechanisms, which is what makes them unmistakable for each other
    // -- and which is why measuring only `.u-word` would have left the criterion
    // half-checked.
    await open(page)

    const rest = { field: await painted(page, FIELD), sigil: await painted(page, SIGIL) }

    await page.locator('.u-prompt').hover()
    const hover = { field: await painted(page, FIELD), sigil: await painted(page, SIGIL) }

    await page.mouse.move(0, 0)
    await page.keyboard.press('Tab')
    const focus = { sigil: await painted(page, SIGIL) }

    expect(hover.field.background).not.toEqual(rest.field.background)
    expect(hover.sigil.background).toEqual(rest.sigil.background)

    expect(focus.sigil.background).not.toEqual(rest.sigil.background)
    expect(focus.sigil.color).toEqual(rest.sigil.background)
  })

  test('no focus ring is drawn on a word, because the page has no boxes', async ({ page }) => {
    await listed(page)

    await page.click(FIELD)
    await page.keyboard.press('Shift+Tab')

    // Read off `outline-style`, not `outline-width`. `outline: none` sets the
    // style and leaves the width at its initial `medium`, so a focused word
    // reports a 3px outline that is never painted -- asserting on the width
    // would fail a page that is doing exactly the right thing.
    const ring = await page.evaluate(() => {
      const focused = document.querySelector('.u-word:focus')
      return focused === null ? null : getComputedStyle(focused).outlineStyle
    })

    expect(ring).toBe('none')
  })
})

test.describe('contrast, in both themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`clears 4.5:1 at rest, hovered and focused in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await listed(page)

      expect(contrast(await painted(page, WORD))).toBeGreaterThanOrEqual(4.5)

      await page.locator(WORD).first().hover()
      expect(contrast(await painted(page, `${WORD}:hover`))).toBeGreaterThanOrEqual(4.5)

      await page.mouse.move(0, 0)
      await page.click(FIELD)
      await page.keyboard.press('Shift+Tab')
      expect(contrast(await painted(page, `${WORD}:focus`))).toBeGreaterThanOrEqual(4.5)
    })
  }
})

test.describe('the shape of the page', () => {
  test('never scrolls sideways, listing and all', async ({ page }) => {
    // The summaries are the longest rows the page has, and at 375 they wrap.
    // This is where that gets proven rather than assumed.
    await listed(page)

    expect(await scrollsHorizontally(page)).toBe(false)
  })

  test('draws no borders, boxes or pills anywhere', async ({ page }) => {
    // "No borders, boxes or buttons are introduced anywhere", as a sweep rather
    // than as a promise. A `<button>` is allowed to exist -- it is the honest
    // element for a word that runs something -- but it may not look like one.
    //
    // All three of the ticket's words are checked, not just the first: a border
    // is a border, a rounded corner is the pill it names, and a shadow is the
    // box. Checking only `border-width` would have passed a pill.
    await listed(page)

    const boxed = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .flatMap((element) => {
          const style = getComputedStyle(element)
          const name = element.tagName.toLowerCase()

          const bordered = [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ].some((width) => width !== '0px')

          const rounded = [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomLeftRadius,
            style.borderBottomRightRadius,
          ].some((radius) => radius !== '0px')

          if (bordered) return [`${name} is bordered`]
          if (rounded) return [`${name} is rounded`]
          if (style.boxShadow !== 'none') return [`${name} has a shadow`]
          return []
        }),
    )

    expect(boxed).toEqual([])
  })
})

test.describe('the three seams, wired', () => {
  test('typing a command prints what the module said it would', async ({ page }) => {
    // Exactly one end-to-end case, and it is labelled as one. It proves the
    // reducer, the renderer and the field are connected -- not that any of them
    // is correct, which is what the other two seams are for.
    await open(page)
    await enter(page, 'help')

    await expect(page.locator('.u-row').filter({ hasText: 'config' }).first()).toBeVisible()
    await expect(page.locator(FIELD)).toHaveValue('')
  })
})
