import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/**
 * The toolchain, not the domain. Everything else in this suite assumes the
 * worker's bindings exist and its schema is applied; this is the one file that
 * checks the assumption rather than relying on it.
 */
describe('the Workers test runtime', () => {
  it('serves the database with migrations already applied', async () => {
    const { results } = await env.DB.prepare('SELECT * FROM playlists').all()

    expect(results).toEqual([])
  })

  it('serves the cache', async () => {
    await env.CACHE.put('playlist:spotify:abc:head', '1')

    expect(await env.CACHE.get('playlist:spotify:abc:head')).toBe('1')
  })

  it('serves the Resolution queue', async () => {
    // Nothing consumes this yet -- the consumer arrives with the Resolution
    // pipeline (#10). A missing binding throws here, so the send is the assertion.
    await expect(env.RESOLUTION_QUEUE.send({ id: 'spotify:abc' })).resolves.not.toThrow()
  })
})
