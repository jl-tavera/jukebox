import { defineConfig, devices } from '@playwright/test'
import { WIDTHS } from './e2e/harness'

/**
 * Seam three of three: the things only a real browser can answer.
 *
 * The other two seams are already drawn and this one must not drift into them.
 * Behaviour belongs to the session module, driven directly under `bun test`
 * with no DOM in the room; what a component does with an intent belongs to a
 * jsdom layer. **Only what needs pixels belongs here** -- an advance width, a
 * contrast ratio, a touch target, a paint that happened before a stylesheet
 * arrived. ADR-0010 puts it plainly: none of it is answerable in jsdom.
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
