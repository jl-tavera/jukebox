import { defineCommand } from 'citty'
import { succeeded, type Renderable } from '../outcome'
import { VERSION } from '../version'

/**
 * The one answer this slice can complete, and the walking skeleton's whole
 * path: an argument vector in, one result object out, rendered two ways.
 *
 * Written as a function as well as a command because `--version` asks the same
 * question at the root. Two ways of asking, one place that answers -- a flag
 * that computed its own would be a second implementation, and the two drift.
 */
export const reportVersion = (): Renderable<{ version: string }> =>
  succeeded('version', { version: VERSION }, () => VERSION)

export const version = defineCommand({
  meta: {
    name: 'version',
    description: 'Report the version of Jukebox you are running',
  },
  run: reportVersion,
})
