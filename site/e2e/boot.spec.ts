import { expect, test, type Page } from '@playwright/test'
import { CLI_VERSION } from '../lib/content'
import { CAP } from '../lib/session/boot'
import { versionLine } from '../lib/session/header'
import { BAR_END } from '../lib/session/select'
import { enter, open, served, SESSION } from './harness'

/**
 * The boot, in the only place its remaining questions can be asked.
 *
 * Seam three, and the boundary is tighter here than anywhere else in this
 * directory because almost none of #84 needs a browser. What the frames contain
 * -- that the wordmark arrives in whole rows, that nothing ever appears and then
 * goes away, that the declared budget fits inside its cap -- is a pure function
 * of the finished session, answered in `test/boot.test.ts` with no DOM in the
 * room. Whether the component starts it, schedules it and skips it is `wiring/`.
 *
 * **What is left is what only a real browser has: a real `matchMedia`, real
 * hydration and a real clock.** Four cases, and they are all this file should
 * need to grow.
 *
 * **The clock is used on the replay's own span and on nothing else.** Measuring
 * from navigation would be the boot plus hydration plus the `font-display:
 * block` period plus whatever a shared runner is doing, against nine hundred
 * milliseconds of headroom -- a number that moves for reasons unrelated to what
 * it watches, and `wordmark.spec.ts` already carries a paragraph about where
 * that ends. Measured from the first state that is missing the session to the
 * last, it is the boot and nothing else, and #84's cap is a fair thing to hold
 * it to.
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
 * **The instrument has to be installed ahead of everything**, because the
 * question is what a visitor saw, and the first thing they saw was served HTML
 * that React had not touched yet. An observer attached after `goto` returns has
 * already missed the frames it exists to catch.
 *
 * `document` is the observation target rather than `documentElement`, which may
 * not exist yet when an init script runs.
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

/**
 * Whether a state of the session is the whole of it.
 *
 * The version line is what the boot prints before the menu opens, and the
 * corner is the last row the session emits at all -- so the pair means
 * *finished* rather than *nearly*, which is the distinction a wait on the
 * version line alone got wrong by six hundred milliseconds.
 */
const complete = (session: string): boolean =>
  session.includes(versionLine(CLI_VERSION)) && session.includes(BAR_END)

test.describe('a visitor who asked for reduced motion', () => {
  test('is handed the finished session, and never sees it move', async ({ page }) => {
    // #84's fourth criterion. The page declines the animation by doing nothing
    // at all, which it can only afford because the session is already in the
    // served HTML -- so turning motion off costs no content.
    await watching(page)
    await served(page)

    // Long enough that a replay which ignored the preference would have been
    // caught in the act. This is the other thing `CAP` is good for out here: a
    // bound to prove an absence over, rather than a deadline to race.
    await page.waitForTimeout(CAP)

    for (const [index, sample] of (await watched(page)).entries()) {
      expect(complete(sample.text), `the session was incomplete at state ${index}`).toBe(true)
    }

    // And the page was live throughout -- otherwise everything above would hold
    // just as well for a browser whose JavaScript never ran, which is
    // `served.spec.ts`'s subject rather than this one's.
    await enter(page, 'help')
    await expect(page.locator(SESSION)).toContainText('Empty the scrollback.')
  })
})

test.describe('a visitor who did not', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('watches the boot type itself, and it arrives whole and in time', async ({ page }) => {
    await watching(page)
    await served(page)

    // **Both halves, or this proves nothing.** That some state on the way was
    // missing the session is the replay actually having run -- the served HTML
    // has it, so only a rewind can take it away. That the last state has it back
    // is the replay having finished. Waiting on the second alone would have
    // resolved against the served HTML before the boot had begun.
    await page.waitForFunction(
      ({ version, corner }) => {
        const seen = window.sessions ?? []
        const last = seen.at(-1)?.text ?? ''

        return (
          seen.some((sample) => !sample.text.includes(version)) &&
          last.includes(version) &&
          last.includes(corner)
        )
      },
      { version: versionLine(CLI_VERSION), corner: BAR_END },
    )

    const seen = await watched(page)
    expect(complete(seen.at(-1)?.text ?? ''), 'the boot stopped short of the session').toBe(true)

    // #84's first criterion, against a real clock. From the first state that
    // was missing the session -- the rewind -- to the last, which is the replay
    // and no part of the page's start-up around it.
    const rewound = seen.findIndex((sample) => !complete(sample.text))
    const span = (seen.at(-1)?.at ?? 0) - (seen[rewound]?.at ?? 0)

    expect(span, `the boot took ${Math.round(span)}ms`).toBeLessThan(CAP)
  })

  test('reaches the end the moment a key is pressed', async ({ page }) => {
    await served(page)

    // Wait until the rewind has actually happened, so there is a boot left to
    // skip. From here roughly a second and a half of it remains.
    await expect(page.locator(SESSION)).not.toContainText(versionLine(CLI_VERSION))

    await page.keyboard.press('Escape')

    // **The tight timeout is the assertion.** A skip lands in one render; the
    // replay it interrupted needed another second at least, so a page that
    // ignored the key fails here rather than passing a beat later.
    await expect(page.locator(SESSION)).toContainText(BAR_END, { timeout: 400 })
  })

  test('sees nothing else on the page animate', async ({ page }) => {
    // "Nothing else on the page animates", as a sweep rather than a promise --
    // the shape `prompt.spec.ts` already uses for "no borders, boxes or pills".
    //
    // **Asked with motion on, which is the only configuration where it means
    // anything.** Under `reduce` a CSS animation guarded by a
    // `prefers-reduced-motion: no-preference` query is suppressed anyway, so the
    // sweep would come back empty while an animation shipped for everybody else.
    //
    // The boot is a sequence of renders and declares no CSS at all, so the
    // answer today is zero. #79 permits exactly one thing to join it -- the
    // block cursor's blink -- and whoever adds it fails here first, which is the
    // intended way to find out this list exists.
    await open(page)

    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('body *')].flatMap((element) => {
        const style = getComputedStyle(element)
        const name = element.tagName.toLowerCase()

        if (style.animationName !== 'none') return [`${name} runs ${style.animationName}`]
        if (Number.parseFloat(style.transitionDuration) > 0) return [`${name} transitions`]
        return []
      }),
    )

    expect(moving).toEqual([])
  })
})
