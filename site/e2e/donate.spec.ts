import { expect, test } from '@playwright/test'
import { donations } from '../lib/content'
import { UNCONFIGURED } from '../lib/session/donate'
import { COPY } from '../lib/session/lines'
import {
  enter,
  FIELD,
  open,
  painted,
  scrollsHorizontally,
  SESSION,
  TARGET,
  undersized,
  WORD,
} from './harness'

/**
 * The donation rows, in the only place their remaining questions can be asked.
 *
 * Seam three, and the boundary is `install.spec.ts`'s. What the block prints,
 * which rows carry a control, and that the whole address rather than the
 * truncation is what the control declares -- all of it is a pure function of
 * `donations`, answered in `test/donate.test.ts` with no browser in the room.
 * That the declaration reaches `clipboard.writeText` is `wiring/`, which is
 * where `SITE.md` 06 asks for it: *capture the argument, not the pixels*.
 *
 * **What is left is the guarantee ADR-0010 gave away and replaced.** The
 * controls used to live in a native `<dialog>`, where focus trapping, Escape
 * and a visible focus state arrived free from the platform -- *"precisely the
 * parts of a modal most often got wrong by hand"*. Deleting the dialog made
 * the last of those a claim instead of a gift, and this file is where the
 * claim is held. Five controls on one screen rather than #91's one, which is
 * the case that would find a target overlapping its neighbour.
 */

test.describe('the rows donate prints', () => {
  test('draws a control on every configured row and on no other', async ({ page }) => {
    await open(page)
    await enter(page, 'donate')

    // Every address in the deck is configured today, so this counts four and
    // the `not configured` row is `test/donate.test.ts`'s to hold. What it is
    // worth here is the pairing: as many controls as rows that have something
    // to copy, on a real page, however many that becomes.
    const configured = donations.filter((donation) => !donation.address.startsWith('<'))

    await expect(page.locator(SESSION)).not.toContainText(UNCONFIGURED)
    await expect(page.locator(`${WORD}`, { hasText: new RegExp(`^${COPY}$`) })).toHaveCount(
      configured.length + 1,
    )
  })

  test('gives every one of them a target a finger can hit', async ({ page }) => {
    // Five controls stacked a row apart is the arrangement that would find a
    // 44px target overlapping the one above it, which #91's single control
    // could not.
    await open(page)
    await enter(page, 'donate')

    expect(await undersized(page, WORD, TARGET)).toEqual([])
  })

  test('wraps the long note rather than dragging the page sideways', async ({ page }) => {
    // The EVM row names five chains and is the longest string the page prints.
    // Wrapping is the CLI's own rule: a long line cut off is a line a reader
    // cannot search for, and a narrow terminal wraps.
    await open(page)
    await enter(page, 'donate')

    expect(await scrollsHorizontally(page)).toBe(false)
  })

  test('is reachable by keyboard, and says so where a reader can see it', async ({ page }) => {
    await open(page)
    await enter(page, 'donate')

    const rest = await painted(page, WORD)

    await page.locator(WORD).first().hover()
    const hover = await painted(page, `${WORD}:hover`)

    // The mouse is moved off before focus is taken, or the focused control
    // would be read with a hover wash still under it.
    await page.mouse.move(0, 0)

    // Focus is reached by keyboard rather than by a click, for the reason
    // `prompt.spec.ts` gives: Chromium does not apply `:focus-visible` to a
    // clicked button, so a spec that clicked would read the resting paint and
    // pass while the criterion failed. Shift+Tab out of the field lands on the
    // last word above it, which is the control on the last donation row.
    await page.click(FIELD)
    await page.keyboard.press('Shift+Tab')

    const focused = page.locator(`${WORD}:focus`)
    await expect(focused).toHaveText(COPY)

    const focus = await painted(page, `${WORD}:focus`)

    // Three distinct states and one identity. Inversion is this page's only
    // focus indicator -- it has no rings and no boxes -- so a control that
    // washed like a hover instead would be one a keyboard user cannot find.
    expect(hover.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(rest.background)
    expect(focus.background).not.toEqual(hover.background)
    expect(focus.color).toEqual(rest.background)
  })
})
