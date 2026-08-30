import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createPlaylist, resolvePlaylist, tracksOf } from './api'

/**
 * The path from Pending to Tracks, driven end to end through the worker's own
 * two entry points: a Playlist is added over HTTP, the Resolution that add
 * asked for is consumed, and the Tracks come back over HTTP carrying a Version.
 *
 * The Source is the stub, so nothing here depends on Spotify's behaviour --
 * that is what lets the plumbing be wrong in an obvious place rather than
 * three layers away from its cause.
 */

/** The stub's fixed set, as the contract describes it. */
const TRACKS = [
  {
    sourceTrackId: 'blue-dot',
    title: 'Blue Dot',
    artists: ['Aria Fenn'],
    album: 'Ninety Miles',
    durationMs: 214_000,
    isrc: 'GBSTU0100001',
    position: 0,
    coverImageUrl: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
  },
  {
    sourceTrackId: 'long-way-down',
    title: 'Long Way Down',
    artists: ['Aria Fenn', 'The Quiet Hour'],
    album: 'Ninety Miles',
    durationMs: 187_500,
    isrc: null,
    position: 1,
    coverImageUrl: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
  },
  {
    sourceTrackId: 'salt-and-wire',
    title: 'Salt and Wire',
    artists: ['Corvid Ten'],
    album: null,
    durationMs: null,
    isrc: 'GBSTU0100003',
    position: 3,
    coverImageUrl: null,
  },
]

describe('Resolution', () => {
  it('turns an added Playlist into Tracks the API serves', async () => {
    await createPlaylist('stub:playlist:served')
    await resolvePlaylist('stub:served')

    const response = await tracksOf('stub:served')

    expect(response.status).toBe(200)
    // Every stub address reaches the same fixed set, so every stub Playlist
    // carries the same name. What a Source offering no usable name is served as
    // is driven against Spotify, where the awkward shapes come from.
    expect(await response.json()).toEqual({
      version: 1,
      title: 'The Fixed Set',
      skipped: 1,
      tracks: TRACKS,
    })
  })

  it('names the answer with the Playlist Version, as a strong ETag', async () => {
    await createPlaylist('stub:playlist:versioned')
    await resolvePlaylist('stub:versioned')

    const response = await tracksOf('stub:versioned')

    // Strong, because it names an immutable snapshot exactly. The first
    // Resolution is Version 1: a Version names a snapshot, and a Pending
    // Playlist has none.
    expect(response.headers.get('etag')).toBe('"1"')
  })

  it('answers Pending until the Resolution has been consumed', async () => {
    await createPlaylist('stub:playlist:not-yet')

    const before = await tracksOf('stub:not-yet')
    expect(before.status).toBe(202)

    await resolvePlaylist('stub:not-yet')

    const after = await tracksOf('stub:not-yet')
    expect(after.status).toBe(200)
  })

  it('counts what the Source offered that is not a Track', async () => {
    await createPlaylist('stub:playlist:counted')
    await resolvePlaylist('stub:counted')

    const { skipped, tracks } = (await (await tracksOf('stub:counted')).json()) as {
      skipped: number
      tracks: { position: number }[]
    }

    // A count of 3 against a Source offering 4 is not data loss, and the
    // reader is told so rather than left to wonder. Position keeps the
    // Source's own index, so the gap at 2 is visible rather than renumbered.
    expect(skipped).toBe(1)
    expect(tracks.map((track) => track.position)).toEqual([0, 1, 3])
  })
})

/**
 * D1 is canonical and read on the cold path only, so what it holds is not
 * visible in any single response. It is asserted directly for the same reason
 * `POST` asserts its Playlist row: the snapshots are rebuilt from here, so a
 * lossy write would only surface much later, and somewhere else.
 */
describe('what a Resolution records', () => {
  it('records the Tracks and their membership of the Playlist', async () => {
    await createPlaylist('stub:playlist:recorded')
    await resolvePlaylist('stub:recorded')

    const { results } = await env.DB.prepare(
      `SELECT t.id, t.source, t.source_track_id, t.title, t.artists, t.album,
              t.duration_ms, t.isrc, t.cover_image_url, m.position
         FROM playlist_tracks m
         JOIN tracks t ON t.id = m.track_id
        WHERE m.playlist_id = ?
        ORDER BY m.position`,
    )
      .bind('stub:recorded')
      .all()

    expect(results).toEqual([
      {
        id: 'stub:blue-dot',
        source: 'stub',
        source_track_id: 'blue-dot',
        title: 'Blue Dot',
        artists: '["Aria Fenn"]',
        album: 'Ninety Miles',
        duration_ms: 214_000,
        isrc: 'GBSTU0100001',
        cover_image_url: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
        position: 0,
      },
      {
        id: 'stub:long-way-down',
        source: 'stub',
        source_track_id: 'long-way-down',
        title: 'Long Way Down',
        // Stored as an array, because that is what it is. Joined into one
        // string, nothing could tell two artists from one whose name has a
        // comma in it -- and the snapshots are rebuilt from this row.
        artists: '["Aria Fenn","The Quiet Hour"]',
        album: 'Ninety Miles',
        duration_ms: 187_500,
        isrc: null,
        cover_image_url: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
        position: 1,
      },
      {
        id: 'stub:salt-and-wire',
        source: 'stub',
        source_track_id: 'salt-and-wire',
        title: 'Salt and Wire',
        artists: '["Corvid Ten"]',
        album: null,
        duration_ms: null,
        isrc: 'GBSTU0100003',
        cover_image_url: null,
        position: 3,
      },
    ])
  })

  it('lets two Playlists hold the same Track', async () => {
    await createPlaylist('stub:playlist:both-of-us')
    await createPlaylist('stub:playlist:so-do-we')
    await resolvePlaylist('stub:both-of-us')

    // The second Resolution meets Tracks the first already recorded. Sharing is
    // the point -- Matching a Track once serves everyone who holds it -- so the
    // Track it meets is left alone rather than rewritten or refused.
    await resolvePlaylist('stub:so-do-we')

    const { results } = await env.DB.prepare(
      `SELECT playlist_id, track_id FROM playlist_tracks
        WHERE playlist_id IN (?, ?)
        ORDER BY playlist_id, position`,
    )
      .bind('stub:both-of-us', 'stub:so-do-we')
      .all()

    expect(results).toEqual([
      { playlist_id: 'stub:both-of-us', track_id: 'stub:blue-dot' },
      { playlist_id: 'stub:both-of-us', track_id: 'stub:long-way-down' },
      { playlist_id: 'stub:both-of-us', track_id: 'stub:salt-and-wire' },
      { playlist_id: 'stub:so-do-we', track_id: 'stub:blue-dot' },
      { playlist_id: 'stub:so-do-we', track_id: 'stub:long-way-down' },
      { playlist_id: 'stub:so-do-we', track_id: 'stub:salt-and-wire' },
    ])
  })
})

/**
 * A snapshot is written under its own Version's key before head is moved to
 * name it. The rule is not a detail of the store -- it is the whole of user
 * story 27, that a reader never receives a track list labelled with the wrong
 * Version -- so it is asserted where a reader stands.
 *
 * This is the one place a test looks between a Resolution's writes. It still
 * names no key: it asks the same question a client would, after each one.
 */
const readingBetweenWrites = (cache: KVNamespace, look: () => Promise<void>): KVNamespace =>
  new Proxy(cache, {
    get: (target, property) => {
      const member = Reflect.get(target, property)

      if (property !== 'put') {
        return typeof member === 'function' ? member.bind(target) : member
      }

      return async (key: string, value: string) => {
        await target.put(key, value)
        await look()
      }
    },
  })

describe('a Resolution part way through', () => {
  it('never names a Version whose Tracks are not there to be served', async () => {
    await createPlaylist('stub:playlist:midway')

    const answers: { status: number; etag: string | null; version: unknown }[] = []

    await resolvePlaylist('stub:midway', {
      CACHE: readingBetweenWrites(env.CACHE, async () => {
        const response = await tracksOf('stub:midway')
        const body = response.status === 200 ? ((await response.json()) as { version: number }) : null

        answers.push({
          status: response.status,
          etag: response.headers.get('etag'),
          version: body?.version,
        })
      }),
    })

    expect(answers.length).toBeGreaterThan(0)

    for (const answer of answers) {
      if (answer.status === 202) continue

      // Head named a Version, so the snapshot it names had already been
      // written: the Tracks are there, and they are labelled with the Version
      // the reader is being told they hold. Naming first would have left this
      // request with a Version and nothing to serve under it.
      expect(answer.status).toBe(200)
      expect(answer.etag).toBe(`"${answer.version}"`)
    }

    // And by the last write there is something to serve, so the loop above is
    // not vacuously true.
    expect(answers.at(-1)).toMatchObject({ status: 200, etag: '"1"', version: 1 })
  })
})

describe('a Resolution message that has been done', () => {
  it('is acknowledged rather than sent round again', async () => {
    await createPlaylist('stub:playlist:acknowledged')

    const result = await resolvePlaylist('stub:acknowledged')

    // A message the consumer returns from without acknowledging comes back,
    // and a Resolution done twice would move the Version with nothing having
    // changed. What the queue was told is the only place that is visible.
    expect(result.retryMessages).toEqual([])
    expect(result.retryBatch).toMatchObject({ retry: false })
  })
})
