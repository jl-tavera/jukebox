import { expect, test } from '@playwright/test'
import { commandFor, PICKER, WHICH_SYSTEM } from '../lib/session/install'
import { enter, FIELD, open, painted, SESSION, TARGET, undersized, WORD } from './harness'

/**
 * The install picker, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary is `menu.spec.ts`'s. Which rows the picker
 * offers, what choosing one runs, what reaches the clipboard -- all of it is a
 * pure function of state, answered in `test/install.test.ts` and
 * `test/terminal.test.ts`. That the intent reaches `clipboard.writeText` at all
 * is `wiring/`, which is where `SITE.md` 06 asks for it: *capture the argument,
 * not the pixels*.
 *
 * **What is left is what only a browser has.** The widget answering a real
 * keyboard on a page nobody has clicked, and -- the requirement ADR-0010 wrote
 * down when it deleted the donate dialog -- *copy controls living in scrollback
 * must stay reachable by keyboard with a visible focus state*. That one was a
 * gift from the platform while the controls lived in a `<dialog>`; in a
 * scrollback it is a claim, and this is where it is held.
 *
 * `prompt.spec.ts` already sweeps every `.u-word` on the booted page for a
 * touch target, so the offer's own control is covered there. What is not
 * covered there is a control that did not exist until a command printed it,
 * which is the case below.
 */

test.describe('the picker', () => {
  test('is the same widget, reached and answered by keyboard', async ({ page }) => {
    await open(page)
    await enter(page, 'install')

    await expect(page.locator(SESSION)).toContainText(WHICH_SYSTEM)

    // Walked to the last row and taken, which is the gesture the frame's own
    // footer advertises. Counted off the picker rather than pressed a fixed
    // number of times, so reordering the systems moves this with them.
    for (let at = 0; at < PICKER.options.length - 1; at++) {
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')

    await expect(page.locator(SESSION)).toContainText(commandFor('windows').command)
  })
})

test.describe('the control the picker leaves behind', () => {
  test('is a target a finger can hit', async ({ page }) => {
    await open(page)
    await enter(page, 'install windows')

    expect(await undersized(page, WORD, TARGET)).toEqual([])
  })

  test('is reachable by keyboard, and says so where a reader can see it', async ({ page }) => {
    await open(page)
    await enter(page, 'install windows')

    const rest = await painted(page, WORD)

    // Focus is reached by keyboard rather than by a click, for the reason
    // `prompt.spec.ts` gives: Chromium does not apply `:focus-visible` to a
    // clicked button, so a spec that clicked would read the resting paint and
    // pass while the criterion failed. Shift+Tab out of the field lands on the
    // last word above it, which is the control this command just printed.
    await page.click(FIELD)
    await page.keyboard.press('Shift+Tab')

    const focused = page.locator(`${WORD}:focus`)
    await expect(focused).toHaveText('copy')

    // Inverted, which is this page's only focus indicator -- it has no rings
    // and no boxes, so a control that did not invert would be one a keyboard
    // user could not find.
    const focus = await painted(page, `${WORD}:focus`)
    expect(focus.background).not.toEqual(rest.background)
    expect(focus.color).toEqual(rest.background)
  })
})
