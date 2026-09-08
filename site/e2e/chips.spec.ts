import { expect, test, type Page } from '@playwright/test'
import {
  CHIP,
  contrast,
  onScreen,
  open,
  painted,
  screenText,
  scrollsHorizontally,
  STATUS,
  TARGET,
  TERMINAL,
  undersized,
} from './harness'

/**
 * The status line, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary holds here as everywhere. *Which* verbs belong
 * on the row, what each of them prints, and that none of them is the binary's
 * are answered in `test/commands.test.ts` with no browser in the room.
 *
 * **#112 made this file the page's whole accessible surface, and that is why
 * it grew rather than shrank.** The scrollback used to be real DOM: every
 * command `help` listed was a `<button>`, and `prompt.spec.ts` measured the
 * target, the two paints and the contrast ratio across all of them. A terminal
 * emulator draws text, so those words are gone and their cases went with them.
 * The chip row is what stayed real DOM -- #112's criterion says so in as many
 * words -- which makes it the only thing left on this page a finger or a
 * keyboard can reach, and the only place that floor can still be held.
 *
 * So the contrast case moved here rather than being deleted with the words it
 * used to sweep. It is the same assertion pointed at the surviving controls.
 */

/** A chip, by the word on it. */
const chip = (page: Page, name: string) =>
  page.locator(CHIP).filter({ hasText: new RegExp(`^${name}$`, 'u') })

/**
 * A session with a good deal behind it.
 *
 * Three listings rather than one, for the reason the old version of this gave
 * -- one `help` does not always fill a 900-tall viewport. **What it no longer
 * proves is that the document scrolls, because since #112 it never does**: the
 * emulator owns its overflow and virtualises the rows outside it. That is the
 * arrangement `globals.css` warned about before it was chosen, and the warning
 * was right about the consequence -- an assertion about a scroll offset taken
 * against this page would be measuring nothing and passing.
 *
 * The questions below are asked of the terminal instead.
 */
const long = async (page: Page): Promise<void> => {
  await open(page)

  for (let listing = 0; listing < 3; listing++) {
    await chip(page, 'help').click()
  }
}

/**
 * Focus, taken by keyboard, landing on the first chip.
 *
 * **By keyboard and never by a click**: Chromium does not apply
 * `:focus-visible` to a clicked button, so a spec that clicked would read the
 * resting paint and pass while the criterion failed.
 *
 * **`Escape` rather than `Tab`, and that is a finding this file made.** The
 * emulator focuses its own textarea as it boots and then swallows every `Tab`,
 * because in a shell `Tab` is completion -- so before `live.tsx` grew an escape
 * hatch, focus entered the terminal on load and never came out. Three presses
 * in a row left `document.activeElement` on the textarea, and the row below was
 * reachable only by blurring it from a script, which is not a thing a visitor
 * can do. That is a keyboard trap, and #112 asks for these chips to be
 * *keyboard reachable*.
 */
const escapeToFirstChip = async (page: Page): Promise<void> => {
  await page.locator(TERMINAL).click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('Escape')
  await expect(page.locator(`${CHIP}:focus`)).toBeVisible()
}

test.describe('the row itself', () => {
  test('stays on screen with a long session behind it', async ({ page }) => {
    // Two cases stood here, at the top and at the bottom of a scrolled
    // document. There is no scrolled document any more, so what is left is the
    // claim that still has a subject: output does not push the row off screen.
    await long(page)

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
  test('shows what it printed, rather than leaving it above the fold', async ({ page }) => {
    // **The case that earns the pinned row its keep or costs it.** The shape of
    // the failure survived #112 even though its mechanism did not: output used
    // to be appended above a block that never moved, and now it is written into
    // a grid that virtualises everything outside its own scrollport. Either way
    // a chip that runs, prints, and leaves the result somewhere the visitor
    // cannot see is "operable on a phone" failing quietly.
    //
    // Read off the rendered rows rather than a scroll offset, which is the
    // honest question of an emulator: a row outside the scrollport is not in
    // the DOM at all, so finding the newest output there is exactly the claim
    // that the terminal followed it down.
    await long(page)
    await chip(page, 'donate').click()

    await expect
      .poll(() => screenText(page), { message: 'the newest output never came into view' })
      .toContain('donate')
  })

  test('raises the keyboard when the terminal itself is tapped', async ({ page }) => {
    // The other half of the same criterion, and the same proxy for it: focusing
    // a text input inside a user gesture is how a page asks for a keyboard.
    // Tapped in the terminal's own top-left padding, which is the element
    // itself rather than any row printed in it.
    //
    // The emulator's input is an `aria-hidden` textarea it owns, so this asks
    // `document.activeElement` rather than naming a selector the site does not
    // control.
    await open(page)
    await page.locator(TERMINAL).click({ position: { x: 2, y: 2 } })

    const focused = await page.evaluate(() => {
      const active = document.activeElement
      return {
        tag: active?.tagName.toLowerCase() ?? null,
        inTerminal: active !== null && active.closest('.wterm') !== null,
      }
    })

    expect(focused).toEqual({ tag: 'textarea', inTerminal: true })
  })
})

test.describe('a chip, focused against hovered', () => {
  test('are two different paints, and neither is the resting one', async ({ page }) => {
    await open(page)

    const first = `${CHIP}:first-of-type`
    const rest = await painted(page, first)

    await page.locator(CHIP).first().hover()
    const hover = await painted(page, `${CHIP}:hover`)

    // The mouse is moved off before focus is taken, or the first chip would be
    // hovered and focused at once and the two paints would not be separable.
    await page.mouse.move(0, 0)
    await escapeToFirstChip(page)
    const focus = await painted(page, `${CHIP}:focus`)

    expect(hover.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(hover.background)

    // Focus inverts, which is this page's only focus indicator -- it has no
    // rings and no boxes, so a chip that did not invert would be one a keyboard
    // user could not find.
    expect(focus.color).toEqual(rest.background)
  })

  test('draws no focus ring, because the page has no boxes', async ({ page }) => {
    await open(page)
    await escapeToFirstChip(page)

    // Read off `outline-style`, not `outline-width`. `outline: none` sets the
    // style and leaves the width at its initial `medium`, so a focused chip
    // reports a 3px outline that is never painted -- asserting on the width
    // would fail a page that is doing exactly the right thing.
    const ring = await page.evaluate(
      (selector) => {
        const focused = document.querySelector(`${selector}:focus`)
        return focused === null ? null : getComputedStyle(focused).outlineStyle
      },
      CHIP,
    )

    expect(ring).toBe('none')
  })
})

test.describe('contrast, in both themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`clears 4.5:1 at rest, hovered and focused in ${scheme}`, async ({ page }) => {
      // `SITE.md` 06's 4.5:1 row, asked of the page's only remaining controls.
      // All three states, because a wash laid under ink is exactly the change
      // that can pass at rest and fail the moment a finger or a Tab arrives.
      await page.emulateMedia({ colorScheme: scheme })
      await open(page)

      expect(contrast(await painted(page, CHIP))).toBeGreaterThanOrEqual(4.5)

      await page.locator(CHIP).first().hover()
      expect(contrast(await painted(page, `${CHIP}:hover`))).toBeGreaterThanOrEqual(4.5)

      await page.mouse.move(0, 0)
      await escapeToFirstChip(page)
      expect(contrast(await painted(page, `${CHIP}:focus`))).toBeGreaterThanOrEqual(4.5)
    })
  }
})
