import type { D1Migration } from '@cloudflare/vitest-plugin'

declare global {
  namespace Cloudflare {
    interface Env {
      // vitest.config.ts reads the migrations directory in Node and passes the
      // result through as a binding, because the Workers runtime has no
      // filesystem to read it from. Test-only, so it is declared here rather
      // than in wrangler.jsonc.
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
