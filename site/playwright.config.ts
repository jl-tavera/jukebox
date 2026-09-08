import { defineConfig, devices } from '@playwright/test'
import { WIDTHS } from './e2e/harness'

/**
 * Seam three of three: the things only a real browser can answer.
 *
 * **Seam two of three since #112, and the boundary moved rather than
 * softened.** Behaviour still belongs to the session module, driven directly
 * under `bun test` with no DOM in the room. What used to sit between them --
 * a jsdom layer asking what a component did with an intent -- is gone with the
 * component it tested: a terminal emulator needs WebAssembly and real text
 * measurement, and jsdom has neither.
 *
 * So this file inherited the half of that layer which still has a subject. The
 * rule it replaces is not *only what needs pixels* any more, because the round
 * trip through `setTheme` and the write to a real clipboard now have nowhere
 * else to close. The rule is: **whatever cannot be answered without a browser,
 * and nothing that can.** An advance width, a contrast ratio, a touch target, a
 * paint that happened before a stylesheet arrived -- and now a lattice of
 * painted cells, a keystroke reaching a shell, and a clipboard.
 *
 * That makes this step load-bearing in a way it was not, which #114 records
 * alongside the rest of what the migration cost.
 *
 * **The viewports are projects rather than loops inside each spec.** Three
 * widths are a property of this page's quality floor -- `SITE.md` 06 names 375,
 * 768 and 1440 -- rather than a property of any one case, and every case a
 * later ticket adds wants all three. As projects they arrive for free: a new
 * spec file is a new spec file, not a new spec file plus a loop somebody has to
 * remember to write. That is what #83 means by a harness later tickets add to
 * without reshaping.
 *
 * **Chromium only, for now.** Font fallback genuinely differs by engine, so
 * more engines would be more coverage of exactly the failure this harness
 * exists for. It is one browser because this repo caches nothing in CI, so each
 * engine is a cold download on every run, and because adding one later is a
 * line in the array below rather than a reshape.
 *
 * **The server is `wrangler dev`, and the target is `out/`.** Every other check
 * in this workspace reads the export rather than `public/`, on the reasoning
 * that a correct source file which never gets copied is a wordmark that shears.
 * A test of the shipped font has no business looking anywhere else. `next dev`
 * would serve a different artifact through a different pipeline, and a font
 * that never reached `out/` would render perfectly under it -- which is to say
 * it would make this harness unable to fail for the one reason it was built.
 *
 * `wrangler.jsonc` already declares `assets.directory: "./out"` and no `main`,
 * so this is production's own asset path, `public/_headers` included.
 *
 * **Every spec here asks for reduced motion, and what it buys changed with
 * #112.** It was written against #84's boot replay: Playwright defaults to
 * `no-preference`, so without the line below the typewriter would have been
 * running underneath every measurement in this directory, and a spec counting
 * rows of art mid-replay would fail on the boot's timing rather than on what it
 * exists to watch. That replay is gone, deleted with the typewriter that paced
 * it.
 *
 * The line stays because the emulator has an animation of its own. `live.tsx`
 * reads `prefers-reduced-motion` once, when the terminal is constructed, and
 * passes it to `cursorBlink` -- so without this the cursor would be blinking
 * under every paint this directory reads, and `painted` resolves a colour at
 * whatever phase it happened to catch. Asking for the page a visitor with
 * reduced motion gets is what makes a contrast ratio a number rather than a
 * coin toss.
 *
 * **What it costs, named rather than found later:** no case here ever sees the
 * cursor blink, so *reduced motion disables it* is asserted nowhere. #114
 * carries that alongside the ticket's other uncovered criteria.
 *
 * It goes through `contextOptions` because `reducedMotion` is not one of the
 * options this version of Playwright promotes to the top level -- `colorScheme`
 * is and it is not, so the escape hatch is the only spelling that typechecks.
 * A project's `use` merges with this one rather than replacing it, and
 * `devices['Desktop Chrome']` sets no context options, so nothing below undoes
 * it.
 *
 * **What that used to cost, and no longer does.** Asking every spec for a page
 * at rest once left hydration nearly unwitnessed: two cases proved the page's
 * JavaScript had run at all, and deleting them would have left a dead page
 * passing this suite. That hazard went with the served HTML. A terminal
 * emulator is WebAssembly and a shell -- there is no pre-hydration page to
 * mistake for a finished one, and `open` in the harness waits for a prompt bash
 * had to boot in order to draw. Every case here now fails on a page that never
 * hydrated, rather than two of them.
 */

const PORT = 8788

export default defineConfig({
  testDir: './e2e',

  // The export has to exist and be current. CI builds before it gets here;
  // locally this fails loudly rather than measuring a stale `out/`.
  webServer: {
    command: `bunx wrangler dev --port ${PORT} --show-interactive-dev-session false`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 60_000,
    // Wrangler phones home on a timer otherwise, which is a third-party request
    // from a workspace whose whole point is making none.
    env: { WRANGLER_SEND_METRICS: 'false' },
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
  },

  // A `.only` left in a spec passes locally and silently narrows CI to one
  // case, which is the failure mode a harness this small would never notice.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  projects: WIDTHS.map((width) => ({
    name: `chromium ${width}`,
    use: { ...devices['Desktop Chrome'], viewport: { width, height: 900 } },
  })),
})
