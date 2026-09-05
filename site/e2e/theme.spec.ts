import { expect, test, type Page } from '@playwright/test'
import { THEMES } from '../lib/session/theme'
import { enter, open, painted, ROW, TARGET, undersized, WORD } from './harness'

/**
 * The theme, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary is the one every file in this directory keeps.
 * What `theme` prints, which words it lists, and that a switch leaves as a
 * declared intent rather than as something the module did -- all answered in
 * `test/theme.test.ts` and `test/commands.test.ts` with no browser. That the
 * intent reaches `setTheme` and that the provider's answer comes back is
 * `wiring/`, where the whole round trip closes inside jsdom.
 *
 * **What is left needs a real one, and one row of ADR-0010's grown floor can
 * be held nowhere else.** *No theme flash on hard reload, in either theme.*
 * That is a claim about what a visitor saw in the first few milliseconds of a
 * document, and the only instrument that can answer it has to be installed
 * before the page's own scripts run.
 *
 * The colours are never spelled here. `SITE.md` 03 keeps every literal hex in
 * `globals.css`, so what this file asserts is that two grounds differ and that
 * a given command reaches one of them -- which is the claim anyway, and which
 * survives somebody changing the yellow.
 */

declare global {
  interface Window {
    /** Every theme `<html>` has carried since this document existed, in order. */
    themes?: { classes: string; rows: number }[]
  }
}

type Sample = { classes: string; rows: number }

/**
 * Watch the theme from before the page's own scripts run.
 *
 * `boot.spec.ts`'s instrument, pointed at a different question and installed
 * for its reason: an observer attached after `goto` returns has already missed
 * the frames it exists to catch, and here those frames are the whole subject.
 *
 * `rows` is what makes *before a visitor could have seen anything* a
 * measurable thing rather than a screenshot race. The page's content is rows;
 * a document with none of them in it has nothing on screen that could have
 * been painted the wrong colour, and `SITE.md` 05 claims exactly that of the
 * inline script -- *it runs before any visible content is parsed*.
 */
const watching = async (page: Page): Promise<void> => {
  await page.addInitScript((selector: string) => {
    window.themes = []

    const record = (): void => {
      window.themes?.push({
        classes: document.documentElement?.className ?? '',
        rows: document.querySelectorAll(selector).length,
      })
    }

    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })

    document.addEventListener('DOMContentLoaded', record)
  }, ROW)
}

const watched = (page: Page): Promise<Sample[]> => page.evaluate(() => window.themes ?? [])

/**
 * The two the class on `<html>` can name.
 *
 * Spelled here rather than imported from `lib/session/theme.ts`, because these
 * are `next-themes`' own class names rather than this page's vocabulary -- the
 * module deliberately never names a class, being the half of the theme with no
 * browser to put one on.
 */
const SCHEMES = ['light', 'dark'] as const

type Painted = (typeof SCHEMES)[number]

const other = (scheme: Painted): Painted => (scheme === 'dark' ? 'light' : 'dark')

/** Whether `<html>` was carrying one at the moment this was recorded. */
const wearing = (sample: Sample, scheme: Painted): boolean =>
  sample.classes.split(/\s+/).includes(scheme)

/** The first moment `<html>` carried a theme at all. */
const decided = (samples: Sample[]): Sample | undefined =>
  samples.find((sample) => SCHEMES.some((scheme) => wearing(sample, scheme)))

const ground = (page: Page): Promise<readonly number[]> =>
  painted(page, 'body').then((paint) => paint.background)

test.describe('no flash on a hard reload', () => {
  for (const scheme of SCHEMES) {
    test(`follows the system into ${scheme} before anything is on screen`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await watching(page)
      await page.goto('/')
      await page.reload()

      const samples = await watched(page)
      const first = decided(samples)

      expect(first, 'the theme was never decided at all').toBeDefined()
      expect(first?.classes).toContain(scheme)
      expect(first?.rows, 'content was already parsed when the theme arrived').toBe(0)
      expect(
        samples.filter((sample) => wearing(sample, other(scheme))),
        `the page was ${other(scheme)} at some point`,
      ).toEqual([])
    })

    test(`honours a stored ${scheme} over a system that says otherwise`, async ({ page }) => {
      // **The case that earns this file.** A theme decided in a mount effect,
      // or corrected after hydration, still passes the two above -- the system
      // and the stored answer agree there, so there is nothing to flash
      // between. Here they disagree, and the wrong answer is the one the
      // stylesheet paints first.
      await page.emulateMedia({ colorScheme: other(scheme) })
      await watching(page)
      await page.goto('/')
      await page.evaluate((value) => window.localStorage.setItem('theme', value), scheme)
      await page.reload()

      const samples = await watched(page)
      const first = decided(samples)

      expect(first?.classes).toContain(scheme)
      expect(first?.rows).toBe(0)
      expect(
        samples.filter((sample) => wearing(sample, other(scheme))),
      ).toEqual([])
    })
  }
})

test.describe('the verb', () => {
  test('moves the page, and gives the system back when asked', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await open(page)

    const light = await ground(page)

    // **Every reading of the ground after a command is polled, and the first
    // one is why.** A switch is a class the provider writes some microtasks
    // after Enter reaches the reducer, so a paint read immediately afterwards
    // is a race that resolves to the previous theme often enough to matter.
    await enter(page, 'theme dark')
    await expect.poll(() => ground(page), { message: 'the ground never went dark' }).not.toEqual(
      light,
    )

    const dark = await ground(page)

    await enter(page, 'theme light')
    await expect.poll(() => ground(page)).toEqual(light)

    // The choice survives a reload, which is the `localStorage` round trip
    // only a real browser has -- `SITE.md` 05 chose storage over a cookie
    // because a cookie would imply a server that reads it.
    await enter(page, 'theme dark')
    await page.reload()
    await expect.poll(() => ground(page)).toEqual(dark)

    // ADR-0010 asks for this by name: one switch must not permanently opt a
    // visitor out of following their operating system.
    await enter(page, 'theme system')
    await expect.poll(() => ground(page)).toEqual(light)

    // And *following* means afterwards too, not once at boot.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => ground(page)).toEqual(dark)
  })

  test('gives all three of its words a target a finger can hit', async ({ page }) => {
    // The first multi-word landables the page has drawn. `theme system` is
    // twelve characters, so the horizontal half of the target is the word
    // itself; what is being measured is the vertical, three rows deep.
    await open(page)
    await enter(page, 'theme')

    expect(await undersized(page, WORD, TARGET)).toEqual([])
    await expect(page.locator(WORD, { hasText: /^theme /u })).toHaveCount(THEMES.length)
  })
})
