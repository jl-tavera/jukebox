import { expect, test } from '@playwright/test'
import { CLI_VERSION, MENU_ENTRIES } from '../lib/content'
import { served } from './harness'

/**
 * The floor, held from the outside.
 *
 * **This spec is the reason `components/screen.tsx` is allowed to be in the
 * client bundle at all.** Until #85 that file was a server component, and "every
 * row is in the served HTML" was structural: a file with no `"use client"` in it
 * cannot render anywhere but on the build machine, and its own docblock said
 * that if it ever became one, the guarantee would go and nothing would fail
 * loudly.
 *
 * It became one. `output: 'export'` prerenders a client component's first
 * render, so the guarantee survives -- but it now rests on a build-time
 * behaviour rather than on a missing directive, and a hydration gate, an effect
 * that clears before it paints or a `dynamic()` with `ssr: false` would each
 * take it away while every other check in this repo stayed green.
 *
 * So the promise is made falsifiable here instead. Delete this file and that
 * paragraph in `screen.tsx` becomes a wish.
 */

test.use({ javaScriptEnabled: false })

test.describe('the page, with no JavaScript at all', () => {
  test('still carries the session it was served with', async ({ page }) => {
    await served(page)

    const session = (await page.locator('main.u-session').textContent()) ?? ''

    // The version line, which is the boot proving it ran.
    expect(session).toContain(`jukebox ${CLI_VERSION}`)

    // The whole menu, and the corner that closes its rail -- the last row the
    // finished session emits, so its presence is the whole list arriving rather
    // than a prefix of it.
    for (const entry of MENU_ENTRIES) {
      expect(session, `the menu lost ${entry.label}`).toContain(entry.label)
    }
    expect(session).toContain('└')
  })

  test('still carries the wordmark', async ({ page }) => {
    await served(page)

    await expect(page.getByRole('img', { name: 'Jukebox' })).toBeVisible()
  })

  test('offers a prompt, which is as far as it can go', async ({ page }) => {
    // Recorded rather than glossed: the field is in the served markup and
    // answers nothing without a script. That is the honest cost of the live
    // prompt, and what ADR-0010 promises is the session, which is above.
    await served(page)

    await expect(page.locator('input.u-input')).toBeVisible()
  })
})
