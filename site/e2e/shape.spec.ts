import { expect, test } from '@playwright/test'
import { enter, open, screenText, scrollsHorizontally } from './harness'

/**
 * The shape of the page, in the only place its remaining questions can be asked.
 *
 * **This file was `prompt.spec.ts` until #112, and it is renamed because none
 * of what it was about survived.** The page had a text field with a sigil
 * beside it, and a scrollback of landable words: `help` printed a listing whose
 * every command was a `<button>` a finger could hit and a keyboard could reach.
 * Six cases here measured those -- a 44px target on every word, focus and hover
 * as two distinct paints, no focus ring, 4.5:1 in both themes, and the field's
 * own pair of states.
 *
 * A terminal emulator draws its scrollback into a character grid. There is no
 * field, no sigil, and a printed command is a run of text rather than an
 * element -- so all six were deleted rather than re-pointed, because a selector
 * pointing at nothing is not a weaker test, it is a green one. **The quality
 * floor they held did not go with them**: the chip row stayed real DOM
 * precisely so that it could keep carrying it, and `chips.spec.ts` is where the
 * target, the two paints and the contrast ratio are now measured. That is what
 * #112's criterion means by *the verb chips remain real DOM*.
 *
 * What is left here is what was never about the prompt: two sweeps over the
 * whole page, and the one end-to-end case that proves the seams are connected.
 */

test.describe('the shape of the page', () => {
  test('never scrolls sideways, listing and all', async ({ page }) => {
    // The summaries are the longest rows the page has, and at 375 they wrap.
    // This is where that gets proven rather than assumed -- and it is a real
    // question of the emulator rather than an inherited one, since a grid whose
    // column count was measured wrong overflows its container instead of
    // reflowing into it.
    await open(page)
    await enter(page, 'help')

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
    //
    // **The sweep now covers the emulator's own markup too**, which is the
    // cheapest possible check that the bridge in `globals.css` did not import a
    // renderer's default chrome along with its palette.
    await open(page)
    await enter(page, 'help')

    const boxed = await page.evaluate(() =>
      [...document.querySelectorAll('body *')].flatMap((element) => {
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

test.describe('the seams, wired', () => {
  test('typing a command prints what the module said it would', async ({ page }) => {
    // Exactly one end-to-end case, and it is labelled as one. It proves the
    // registry, the shell and the emulator are connected -- not that any of
    // them is correct, which is what the seam below this one is for.
    //
    // `config` is asserted rather than the whole listing because it is a row
    // `test/commands.test.ts` already pins the wording of: what is being read
    // here is that the generated help reached a grid at all.
    await open(page)
    await enter(page, 'help')

    expect(await screenText(page)).toContain('config')
  })
})
