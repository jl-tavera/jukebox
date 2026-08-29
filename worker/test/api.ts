import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { vi } from 'vitest'
import worker from '../src/index'
import type { ResolutionMessage } from '../src/resolution'

/**
 * The worker's own entry points, which every test here drives rather than
 * importing a route module: the routing, the JSON body handling and the
 * response headers are then under test rather than assumed.
 */

export const createPlaylist = (url: unknown) =>
  exports.default.fetch('https://api.jukebox.dev/playlists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })

export const tracksOf = (id: string) =>
  exports.default.fetch(`https://api.jukebox.dev/playlists/${id}/tracks`)

/**
 * The other entry point. `exports.default` is a Fetcher and carries only
 * `fetch`, so the consumer is reached through the default export itself --
 * still the worker's boundary, not a module behind it.
 *
 * `bindings` lets a test hand the consumer a binding of its own. Nothing in
 * the worker knows it happened, which is the point: it is the same trick as
 * standing in for global `fetch`, at the same kind of boundary.
 */
export const resolvePlaylist = async (id: string, bindings: Partial<Env> = {}) => {
  const work: ResolutionMessage = { id }
  const batch = createMessageBatch<ResolutionMessage>('jukebox-resolution', [
    { id: `resolution-of-${id}`, timestamp: new Date(), attempts: 1, body: work },
  ])
  const ctx = createExecutionContext()

  await worker.queue(batch, { ...env, ...bindings })

  return getQueueResult(batch, ctx)
}

/**
 * Runs `work` with the network standing still.
 *
 * The same trick as `bindings` above, at the same kind of boundary: global
 * `fetch` is where a Source is reached, so it is where a Source can be stood
 * in for, and nothing is added to the worker's own code to make it testable.
 * The spy is removed however `work` ends, so one test cannot leave the network
 * replaced for the next.
 */
export const insteadOfTheNetwork = async <T>(
  answer: typeof globalThis.fetch,
  work: () => Promise<T>,
): Promise<T> => {
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(answer)

  try {
    return await work()
  } finally {
    network.mockRestore()
  }
}
