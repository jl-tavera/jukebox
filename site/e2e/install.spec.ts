import { expect, test } from '@playwright/test'
import { commandFor, WHICH_SYSTEM } from '../lib/session/install'
import { clipboardText, enter, open, screenText } from './harness'

/**
 * `install`, in the only place its remaining questions can be asked.
 *
 * **Two of this file's three cases lost their subject to #112, and the third
 * arrived because another seam did.**
 *
 * What went: the picker was a reproduction of a prompt library's widget --
 * arrow keys, a cursor, a struck-out abandoned value -- built in #86 because
 * the page had no shell to ask. It has one now, so the systems are typed rather
 * than walked to, and *the menu stops being a select* is this ticket's point
 * rather than a casualty of it. The control it left behind in the scrollback
 * went the same way: a copy button in a character grid is a run of text, so the
 * 44px target and the focus state that were measured on it have nothing left to
 * measure. `chips.spec.ts` holds that floor against the row that is still DOM.
 *
 * What arrived: **that `install` actually copies.** It is one of #112's
 * acceptance criteria and it had no test at any seam. `SITE.md` 06 asked for it
 * as *capture the argument, not the pixels*, and the jsdom layer captured the
 * argument to `clipboard.writeText` -- then #112 deleted that layer along with
 * the component it tested. A real clipboard in a real browser is the only place
 * left that can answer it, so it is answered here.
 */

/**
 * Read and write, because the assertion needs both halves.
 *
 * Chromium gates `readText` behind a permission that headless does not grant by
 * default, and granting it per-context here rather than in `playwright.config.ts`
 * keeps every other spec in this directory running without a capability it has
 * no use for.
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.describe('the verb', () => {
  test('puts the install command on the clipboard', async ({ page }) => {
    await open(page)
    await enter(page, 'install windows')

    // The whole command, not a truncation of it. What the page prints is
    // allowed to be shortened to fit a grid; what it copies is what somebody
    // pastes into a shell, and a copy that lost its tail is worse than no copy
    // at all -- `test/install.test.ts` pins the two apart, and this is the end
    // of that claim that only a browser holds.
    const { command } = commandFor('windows')

    await expect
      .poll(() => clipboardText(page), { message: 'nothing reached the clipboard' })
      .toBe(command)
  })

  test('offers the systems when it is not told one', async ({ page }) => {
    await open(page)
    await enter(page, 'install')

    // The rows themselves are `test/install.test.ts`'s, down to their wording.
    // What is worth a browser is that the bare verb reaches the registry at all
    // -- it is the one command on this page that answers differently with an
    // argument and without one, and bash is what decides which.
    expect(await screenText(page)).toContain(WHICH_SYSTEM)
  })
})
