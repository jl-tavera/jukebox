import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      // The `test` environment, not the top level: it is the one surface with no
      // queue consumer, because these tests drive the consumer themselves. See
      // the comment on that block in wrangler.jsonc for why that matters.
      wrangler: { configPath: './wrangler.jsonc', environment: 'test' },
      miniflare: {
        // Read in Node, applied inside the Workers runtime by test/apply-migrations.ts.
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, 'migrations')),
        },
      },
    })),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
