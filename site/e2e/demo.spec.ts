import { expect, test, type Page } from '@playwright/test'
import { CAP, CLOSING, OPENING } from '../lib/session/demo'
import { CHIP, enter, open, scrollsHorizontally, served, SESSION, undersized, WORD } from './harness'

/**
 * The recording, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary is as tight here as `boot.spec.ts` draws it for
 * the boot -- for the same reason, since #90 reuses that machinery rather than
 * adding any. What the transcript says, that every frame is a prefix of it, and
 * that the declared budget fits inside its cap are all pure functions of the
 * script, answered in `test/demo.test.ts` with no DOM in the room. Whether the
 * component starts it, skips it and follows it down the page is `wiring/`.
 *
 * **What is left is what only a real browser has: a real `matchMedia`, a real
 * clock, and a layout.** The last of those is the one thing this file adds that
 * `boot.spec.ts` had no reason to: the recording prints the widest row on the
 * page by some margin, and whether that costs a visitor a sideways scroll is not
 * answerable anywhere else.
 */

declare global {
  interface Window {
    /** Every state `main.u-session` has been in since this document existed, and when. */
    sessions?: { text: string; at: number }[]
  }
}

type Sample = { text: string; at: number }

/**
 * Watch the session from before the page's own scripts run.
 *
 * `boot.spec.ts`'s instrument, and deliberately the same one: the question here
 * is the same question -- what states did a visitor actually pass through --
 * and a second observer written slightly differently would be a second thing to
 * keep correct.
 */
const watching = async (page: Page): Promise<void> => {
  await page.addInitScript((selector: string) => {
    window.sessions = []

    const record = (): void => {
      const session = document.querySelector(selector)
      if (session !== null) {
        window.sessions?.push({ text: session.textContent ?? '', at: performance.now() })
      }
    }

    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    })

    document.addEventListener('DOMContentLoaded', record)
  }, SESSION)
}

const watched = (page: Page): Promise<Sample[]> => page.evaluate(() => window.sessions ?? [])

/** Every state that had the recording under way, finished or not. */
const during = (seen: readonly Sample[]): Sample[] =>
  seen.filter((sample) => sample.text.includes(OPENING))

test.describe('a visitor who asked for reduced motion', () => {
  test('is handed the whole recording at once, and never sees it arrive', async ({ page }) => {
    // **The recording is content and the playing is the enhancement**, so
    // declining the animation costs no row -- the trade #84 made for the boot,
    // arrived at from the other side. Here the command has already run by the
    // time the preference is consulted, so the rows land either way.
    await watching(page)
    await served(page)

    await enter(page, 'demo')
    await expect(page.locator(SESSION)).toContainText(CLOSING)

    // Long enough that a recording which ignored the preference would have been
    // caught mid-arrival. `boot.spec.ts` uses its own cap the same way: a bound
    // to prove an absence over rather than a deadline to race.
    await page.waitForTimeout(CAP)

    // Every state that had the recording on screen at all had the whole of it.
    // A partial one is exactly what animating means.
    for (const [index, sample] of during(await watched(page)).entries()) {
      expect(sample.text.includes(CLOSING), `the recording was partial at state ${index}`).toBe(
        true,
      )
    }
  })
})

test.describe('a visitor who did not', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('watches it arrive, and it finishes whole and in time', async ({ page }) => {
    await watching(page)
    await served(page)

    await enter(page, 'demo')

    // **Both halves, or this proves nothing.** That some state had the opening
    // label without the closing one is the recording actually having played;
    // that the last has both is it having finished. Waiting on the second alone
    // would resolve against a page that printed the whole thing at once.
    await page.waitForFunction(
      ({ opening, closing }) => {
        const seen = window.sessions ?? []
        const last = seen.at(-1)?.text ?? ''

        return (
          seen.some((sample) => sample.text.includes(opening) && !sample.text.includes(closing)) &&
          last.includes(closing)
        )
      },
      { opening: OPENING, closing: CLOSING },
    )

    // Against a real clock, and measured on the recording's own span rather than
    // from navigation -- `boot.spec.ts` carries the paragraph about why the
    // second reading would be watching hydration and a loaded runner instead.
    const played = during(await watched(page))
    const span = (played.at(-1)?.at ?? 0) - (played[0]?.at ?? 0)

    expect(span, `the recording took ${Math.round(span)}ms`).toBeLessThan(CAP)

    // **A floor as well as a ceiling, and the floor is the half that catches a
    // recording which did not play at all.** React appends twenty-nine rows in
    // several mutations even when they land in one commit, so the observer sees
    // partial states either way and "some sample was incomplete" proves nothing
    // on its own. Time is what tells the two apart: printed at once this is a
    // handful of milliseconds, and played it cannot be under a second.
    expect(span, `the recording took ${Math.round(span)}ms, which is not playing`).toBeGreaterThan(
      1000,
    )
  })

  test('reaches the end the moment a key is pressed', async ({ page }) => {
    await served(page)
    await enter(page, 'demo')

    // There is a recording left to skip: the closing label is roughly two and a
    // half seconds away at this point.
    await expect(page.locator(SESSION)).toContainText(OPENING)
    await expect(page.locator(SESSION)).not.toContainText(CLOSING)

    await page.keyboard.press('Escape')

    // **The tight timeout is the assertion.** A skip lands in one render, and
    // what it interrupted needed seconds -- so a page that ignored the key fails
    // here rather than passing a beat later.
    await expect(page.locator(SESSION)).toContainText(CLOSING, { timeout: 400 })
  })
})

test.describe('the recording on screen', () => {
  /** The whole transcript, printed and finished, at whatever width this project runs. */
  const printed = async (page: Page): Promise<void> => {
    await open(page)
    await enter(page, 'demo')
    await page.keyboard.press('Escape')
    await expect(page.locator(SESSION)).toContainText(CLOSING)
  }

  test('does not push the page sideways, however wide its widest row is', async ({ page }) => {
    // **The one question this ticket adds that no earlier spec could ask.** The
    // Removed row is 104 characters -- the widest thing the page ever prints,
    // half again the wordmark's 67 -- so if anything here is going to overflow a
    // phone it is this. The CLI's own rule is that a narrow terminal wraps
    // rather than truncating, and `globals.css` is what has to honour it.
    await printed(page)

    expect(await scrollsHorizontally(page)).toBe(false)
  })

  test('leaves every control still big enough to hit', async ({ page }) => {
    // The recording draws no landable word of its own -- `test/demo.test.ts`
    // pins that no row of it runs or copies anything -- so what this guards is
    // the row of chips underneath, which #89 pinned to the bottom of the
    // viewport and which a page grown by twenty-nine rows must not have moved or
    // covered.
    await printed(page)

    expect(await undersized(page, CHIP)).toEqual([])
    expect(await undersized(page, WORD)).toEqual([])
  })
})
