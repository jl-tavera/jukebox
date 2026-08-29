import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { ErrorEnvelope } from '@jukebox/schema'

/**
 * Driven through the worker's own entry point rather than the route module, so
 * the routing, the JSON body handling and the response headers are all under
 * test and not merely assumed.
 */
const createPlaylist = (url: unknown) =>
  exports.default.fetch('https://api.jukebox.dev/playlists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })

describe('POST /playlists', () => {
  it('rejects a URL that no Source claims', async () => {
    const response = await createPlaylist('https://example.com/not-a-playlist')

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = (await response.json()) as ErrorEnvelope
    expect(body.error.code).toBe('invalid_url')
  })

  it('says what the reader should do about it', async () => {
    const response = await createPlaylist('https://example.com/not-a-playlist')
    const { error } = (await response.json()) as ErrorEnvelope

    // The CLI prints this verbatim, so it has to read as a sentence to a person
    // rather than as a code they have to look up.
    expect(error.message).toMatch(/playlist/i)
    expect(error.message).not.toContain('invalid_url')
    expect(error.message.length).toBeGreaterThan(20)
  })

  it('rejects a body with no url at all', async () => {
    const response = await createPlaylist(undefined)

    expect(response.status).toBe(400)
    const body = (await response.json()) as ErrorEnvelope
    expect(body.error.code).toBe('invalid_url')
  })
})
