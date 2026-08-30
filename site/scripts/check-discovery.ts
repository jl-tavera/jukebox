import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { discoveryProblems } from '@jukebox/schema'

/**
 * Checks the discovery document the site has just built against the shared
 * type. Run after `next build`, and again by `deploy` before anything reaches
 * Cloudflare.
 *
 * It reads `out/`, not `public/`, and the difference is the point: this fails
 * both when the document is wrong and when a build change quietly stopped
 * publishing it. `public/discovery.json` being correct is worth nothing if it
 * never makes it into the export.
 *
 * Spec #29 is explicit that this is a CI step and not a test -- "a test would
 * pin the file's location rather than the behaviour that matters".
 *
 * Note for anyone tempted to replace this with `import doc from
 * '../public/discovery.json'` and a `satisfies DiscoveryDocument`: it does not
 * work. TypeScript widens a JSON module's string values to `string`, so
 * `status` never satisfies its union and the one field most worth checking is
 * the one that would go unchecked.
 */

const NAME = 'site/out/discovery.json'
const FILE = fileURLToPath(new URL('../out/discovery.json', import.meta.url))

const fail = (...lines: string[]): never => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

const readPublished = (): unknown => {
  let text: string
  try {
    text = readFileSync(FILE, 'utf8')
  } catch {
    return fail(
      `${NAME} is not there.`,
      'The build did not publish it. Every installed CLI reads this file on boot.',
    )
  }

  try {
    return JSON.parse(text)
  } catch (cause) {
    return fail(`${NAME} is not JSON: ${(cause as Error).message}`)
  }
}

const problems = discoveryProblems(readPublished())

if (problems.length > 0) {
  fail(
    `${NAME} is not a discovery document:`,
    ...problems.map((problem) => `  - ${problem}`),
  )
}

console.log(`${NAME} satisfies DiscoveryDocument.`)
