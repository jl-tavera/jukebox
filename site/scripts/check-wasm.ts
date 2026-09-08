import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Checks that the export ships no WebAssembly file. Run after `next build`, and
 * again by `deploy` before anything reaches Cloudflare.
 *
 * It reads `out/`, not `node_modules/`, for the reason `check-discovery.ts` and
 * `check-fonts.ts` both give: what matters is what got published, and a
 * dependency's own layout is not that.
 *
 * **What this is guarding.** #112 put a terminal emulator on the landing page,
 * and it runs on a WebAssembly module. `@wterm/core` ships that module twice --
 * once as `wasm/wterm.wasm` and once base64-encoded inside `dist/wasm-inline.js`
 * -- and picks between them on whether a `wasmUrl` was given. Giving one is a
 * single prop, so the separate file is one edit away at any time, and the
 * difference is invisible on a page that works either way locally.
 *
 * It would not be invisible in production. A `.wasm` in the export is a second
 * request on the critical path, served under `public/_headers`' rules, from a
 * Worker whose asset serving this project has deliberately never had to think
 * about. The inlined path keeps the page one request, keeps the header config
 * unchanged, and keeps the emulator working when nothing else can be fetched --
 * which is the same reasoning that put the fonts in the repo rather than on a
 * CDN.
 *
 * **It looks for the extension rather than for a known filename.** A check
 * naming `wterm.wasm` would pass the day a bundler renames it into a content
 * hash, which is exactly the day it would start being served.
 */

const EXPORT = fileURLToPath(new URL('../out', import.meta.url))

/** Every file under a directory, depth first. Relative to what was handed in. */
const walk = (directory: string, prefix = ''): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    return entry.isDirectory() ? walk(`${directory}/${entry.name}`, path) : [path]
  })

const modules = walk(EXPORT).filter((path) => path.toLowerCase().endsWith('.wasm'))

if (modules.length > 0) {
  console.error(
    [
      `The export carries ${modules.length} WebAssembly file(s):`,
      ...modules.map((path) => `  out/${path}`),
      '',
      'The emulator is meant to run from the base64 module inlined in',
      '@wterm/core, which is what it does when no `wasmUrl` is given. Check',
      'components/live.tsx for a `wasmUrl` prop before changing this check.',
    ].join('\n'),
  )

  process.exit(1)
}

console.log('No WebAssembly file in the export. The emulator is running inlined.')
