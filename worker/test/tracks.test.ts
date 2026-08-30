import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:workers'
import type { ErrorEnvelope, PlaylistTracks } from '@jukebox/schema'
import { createPlaylist, resolvePlaylist, tracksOf, tracksOfWithBindings } from './api'
import { counting, missingTheFirstRead } from './bindings'

describe('GET /playlists/{id}/tracks', () => {
  it('answers Pending for a Playlist nothing has resolved yet', async () => {
    await createPlaylist('https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n')

    const response = await tracksOf('spotify:3cEYpjA9oz9GiPac4AsH4n')

    // This is the poll response: the CLI asks again rather than treating an
    // empty track list as an answer.
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'pending' })
  })

  it('answers the same when the id arrives percent-encoded', async () => {
    await createPlaylist('https://open.spotify.com/playlist/03Xz4NcdaWjZq2T6sKNLui')

    // A colon is legal in a path segment, but a client that escapes it anyway
    // is asking about the same Playlist.
    const response = await tracksOf('spotify%3A03Xz4NcdaWjZq2T6sKNLui')

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'pending' })
  })

  it('says so when nothing is tracking that Playlist', async () => {
    const response = await tracksOf('spotify:0000000000000000000000')

    expect(response.status).toBe(404)

    const { error } = (await response.json()) as ErrorEnvelope
    expect(error.code).toBe('playlist_not_found')

    // Printed verbatim by the CLI, so it has to name the way out rather than
    // leave the reader with a status code.
    expect(error.message).toMatch(/add/i)
    expect(error.message).not.toContain('playlist_not_found')
  })
})

/** A resolved Playlist at Version 1, from the Source that reaches no network. */
const resolved = async (name: string) => {
  await createPlaylist(`stub:playlist:${name}`)
  await resolvePlaylist(`stub:${name}`)
  return `stub:${name}`
}

describe('a sync that finds nothing has changed', () => {
  it('answers with no body when the caller already holds this Version', async () => {
    const id = await resolved('unchanged')

    const response = await tracksOf(id, { 'if-none-match': '"1"' })

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
    // The same ETag it would have sent with the body, so a client that stores
    // whatever came back is storing the same thing either way.
    expect(response.headers.get('etag')).toBe('"1"')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('answers a weakened ETag too', async () => {
    const id = await resolved('weakened')

    // Nothing here marks an ETag weak, but something between here and a client
    // may: an edge that re-encodes a response is the usual cause. A comparison
    // that missed it would send a whole snapshot to a client that already had
    // it, silently, with every other test in this file still green.
    const response = await tracksOf(id, { 'if-none-match': 'W/"1"' })

    expect(response.status).toBe(304)
  })

  it('answers a caller asking for anything it does not already have', async () => {
    const id = await resolved('anything')

    // RFC 9110 gives `*` the meaning "whatever you have now". This is only ever
    // reached where a Version exists, so whatever we have is the thing being
    // asked about, and the answer is the same as naming it.
    const response = await tracksOf(id, { 'if-none-match': '*' })

    expect(response.status).toBe(304)
  })

  it('sends the Tracks when the caller holds an older Version', async () => {
    const id = await resolved('behind')

    const response = await tracksOf(id, { 'if-none-match': '"0"' })

    // A comparison, not a presence test.
    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"1"')
  })

  it('reads one cache key and asks the database nothing', async () => {
    const id = await resolved('cheap')
    const database: string[] = []
    const cache: string[] = []

    const response = await tracksOfWithBindings(
      id,
      { DB: counting(env.DB, database), CACHE: counting(env.CACHE, cache) },
      { 'if-none-match': '"1"' },
    )

    // DESIGN section 05: "no D1 query, no snapshot read, no JSON parse. Any
    // change that puts a D1 query on this path is a regression even if it
    // passes tests." So this is the test that would not pass.
    expect(response.status).toBe(304)
    expect(database).toEqual([])
    expect(cache).toEqual(['get'])
  })

  it('costs more than that when the caller holds nothing', async () => {
    const id = await resolved('full')
    const database: string[] = []
    const cache: string[] = []

    const response = await tracksOfWithBindings(id, {
      DB: counting(env.DB, database),
      CACHE: counting(env.CACHE, cache),
    })

    // The control. Without it, "one cache read" above could be a property of
    // the endpoint rather than of the conditional path, and the assertion would
    // hold for a handler that never read a snapshot at all.
    expect(response.status).toBe(200)
    expect(cache.length).toBeGreaterThan(1)
  })
})


describe('a cache that has not caught up with its own writes', () => {
  it('serves the Version the row names when head reads as missing', async () => {
    const id = await resolved('negatively-cached')

    // Head reads `null` for a Playlist whose Resolution has finished, which is
    // what a negatively cached miss looks like from in here. The row knows the
    // Version, and the snapshot under it was written before head was, so there
    // is a right answer to give -- and a 500 with no code for the CLI to branch
    // on is not it.
    const response = await tracksOfWithBindings(id, { CACHE: missingTheFirstRead(env.CACHE) })

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"1"')

    // The whole snapshot, not a placeholder: the same answer the hot path gives.
    const served = (await response.json()) as PlaylistTracks
    expect(served.version).toBe(1)
    expect(served.skipped).toBe(1)
    expect(served.tracks.map((track) => track.title)).toEqual([
      'Blue Dot',
      'Long Way Down',
      'Salt and Wire',
    ])
  })

  it('still answers a caller holding that Version with no body', async () => {
    const id = await resolved('negatively-cached-conditional')

    // The Version is the Version wherever it was read from, so a client that
    // already holds it gets the same empty answer -- and this path never reads
    // the snapshot at all.
    const response = await tracksOfWithBindings(
      id,
      { CACHE: missingTheFirstRead(env.CACHE) },
      { 'if-none-match': '"1"' },
    )

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
    expect(response.headers.get('etag')).toBe('"1"')
  })
})
