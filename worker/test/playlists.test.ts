import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { ErrorEnvelope } from '@jukebox/schema'
import { createPlaylist } from './api'

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

describe('POST /playlists with a URL a Source claims', () => {
  it('answers with the Playlist id and Pending, without reading the Source', async () => {
    const response = await createPlaylist(
      'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n',
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      id: 'spotify:3cEYpjA9oz9GiPac4AsH4n',
      status: 'pending',
    })
  })

  it('reaches no Source to do it', async () => {
    const network = vi.spyOn(globalThis, 'fetch')

    try {
      const response = await createPlaylist(
        'https://open.spotify.com/playlist/6M6POvx8hfKqsM1G8z1Pz5',
      )

      // The whole point of the ticket: a Playlist is tracked on the strength of
      // its address alone, so upstream usage stays proportional to Playlists
      // rather than to the people adding them.
      expect(response.status).toBe(202)
      expect(network).not.toHaveBeenCalled()
    } finally {
      network.mockRestore()
    }
  })

  it('records the Playlist against its Source, its id there and its URL', async () => {
    const url = 'https://open.spotify.com/playlist/03Xz4NcdaWjZq2T6sKNLui'
    await createPlaylist(url)

    const row = await env.DB.prepare(
      'SELECT source, source_id, url, status FROM playlists WHERE id = ?',
    )
      .bind('spotify:03Xz4NcdaWjZq2T6sKNLui')
      .first()

    expect(row).toEqual({
      source: 'spotify',
      source_id: '03Xz4NcdaWjZq2T6sKNLui',
      url,
      status: 'pending',
    })
  })

  it('is harmless to add the same Playlist twice', async () => {
    const url = 'https://open.spotify.com/playlist/7JQrxQmrwXvOnCdx7LNs07'

    const first = await createPlaylist(url)
    const again = await createPlaylist(url)

    expect(await again.json()).toEqual(await first.json())

    const { count } = (await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM playlists WHERE id = ?',
    )
      .bind('spotify:7JQrxQmrwXvOnCdx7LNs07')
      .first<{ count: number }>())!

    expect(count).toBe(1)
  })
})


/**
 * Every URL shape is fully observable in the response -- an id, or a rejection
 * -- so the adapter's cases are driven through the same entry point as
 * everything else rather than by opening a seam onto `claims` and `parse`.
 */
describe('the addresses a person can paste', () => {
  const SOURCE_ID = '3cEYpjA9oz9GiPac4AsH4n'

  it.each([
    ['a browser address', `https://open.spotify.com/playlist/${SOURCE_ID}`],
    ['a Share link, tracking parameter and all', `https://open.spotify.com/playlist/${SOURCE_ID}?si=8f1c0d2e`],
    ['an address from a browser that is not in English', `https://open.spotify.com/intl-es/playlist/${SOURCE_ID}`],
    ['an address from a browser naming a region too', `https://open.spotify.com/intl-pt-BR/playlist/${SOURCE_ID}`],
    ['the URI the desktop app copies', `spotify:playlist:${SOURCE_ID}`],
  ])('reaches the same Playlist from %s', async (_, url) => {
    const response = await createPlaylist(url)

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ id: `spotify:${SOURCE_ID}` })
  })

  it.each([
    ['a track', `https://open.spotify.com/track/${SOURCE_ID}`],
    ['an album', `https://open.spotify.com/album/${SOURCE_ID}`],
    ['a playlist address carrying no id', 'https://open.spotify.com/playlist/'],
    ['an id a character short', 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4'],
    ['a lookalike host', `https://open-spotify.com/playlist/${SOURCE_ID}`],
    ['an address over http, which Spotify does not serve', `http://open.spotify.com/playlist/${SOURCE_ID}`],
  ])('does not claim %s', async (_, url) => {
    const response = await createPlaylist(url)

    expect(response.status).toBe(400)
    expect(((await response.json()) as ErrorEnvelope).error.code).toBe('invalid_url')
  })
})

/**
 * The queue is the boundary Resolution crosses, the way global `fetch` is the
 * boundary a Source crosses. It is watched here for the same reason: what the
 * worker hands to it is observable, and nothing else in the response says
 * whether Resolution was asked for once, twice or not at all.
 */
describe('the Resolution a new Playlist asks for', () => {
  it('enqueues exactly one', async () => {
    const enqueued = vi.spyOn(env.RESOLUTION_QUEUE, 'send')

    try {
      await createPlaylist('https://open.spotify.com/playlist/2JxNo3xcSFEXUdU7CrKgYn')

      expect(enqueued).toHaveBeenCalledTimes(1)
      expect(enqueued).toHaveBeenCalledWith({ id: 'spotify:2JxNo3xcSFEXUdU7CrKgYn' })
    } finally {
      enqueued.mockRestore()
    }
  })

  it('asks for none at all when the Playlist is already tracked', async () => {
    const url = 'https://open.spotify.com/playlist/1AAAAAAAAAAAAAAAAAAAAA'
    await createPlaylist(url)

    const enqueued = vi.spyOn(env.RESOLUTION_QUEUE, 'send')

    try {
      // Re-adding is harmless, and that has to reach the queue too: a Playlist
      // resolved once must not be resolved again by someone rerunning the
      // command, or upstream usage stops being proportional to Playlists.
      const again = await createPlaylist(url)

      expect(again.status).toBe(202)
      expect(enqueued).not.toHaveBeenCalled()
    } finally {
      enqueued.mockRestore()
    }
  })
})

/**
 * The registry stops being a list of one. Which adapter answers is decided by
 * the addresses themselves, not by a branch in the route -- the property that
 * makes Apple Music additive rather than an audit of every call site.
 */
describe('a registry holding more than one Source', () => {
  it('reaches the stub Source by its own address', async () => {
    const response = await createPlaylist('stub:playlist:small-fixed-set')

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      id: 'stub:small-fixed-set',
      status: 'pending',
    })
  })

  it('still reaches Spotify for a Spotify address', async () => {
    const response = await createPlaylist(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    )

    expect(await response.json()).toMatchObject({ id: 'spotify:37i9dQZF1DXcBWIGoYBM5M' })
  })
})
