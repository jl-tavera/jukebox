import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { PlaylistTracks } from '@jukebox/schema'
import { CREDENTIALS, spotifyServing } from '../src/sources/spotify/__fixtures__/network'
import onePage from '../src/sources/spotify/__fixtures__/one-page.json'
import severalArtists from '../src/sources/spotify/__fixtures__/several-artists.json'
import { createPlaylist, insteadOfTheNetwork, resolvePlaylist, tracksOf } from './api'
import { refusingToStore, refusingUpdates } from './bindings'

/**
 * A Resolution delivered a second time.
 *
 * Nothing could reach this before: a message was delivered once and either
 * worked or was lost with it. Retrying a failure is what makes a second
 * delivery of the same Playlist ordinary, and a queue may also redeliver one
 * that already succeeded -- so every one of these is now a state the worker has
 * to be right about rather than a hypothetical.
 *
 * The failures are induced through bindings, the same way a Source is stood in
 * for: they are the boundary a Resolution crosses, so they are where one can be
 * interrupted without putting a seam inside the worker to do it.
 */

/** How many Tracks a Playlist currently holds, as D1 records it. */
const membershipOf = async (id: string) => {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?',
  )
    .bind(id)
    .first<{ count: number }>()

  return row!.count
}

const playlistRow = (id: string) =>
  env.DB.prepare('SELECT status, version, last_refreshed_at FROM playlists WHERE id = ?')
    .bind(id)
    .first<{ status: string; version: number; last_refreshed_at: number | null }>()

describe('a Resolution delivered again after it succeeded', () => {
  it('moves no Version, because nothing about the Playlist changed', async () => {
    await createPlaylist('stub:playlist:delivered-twice')
    await resolvePlaylist('stub:delivered-twice')
    await resolvePlaylist('stub:delivered-twice')

    const response = await tracksOf('stub:delivered-twice')

    // A Version increases when the Playlist's contents change, and reading the
    // same contents twice is not a change. A client that had synced after the
    // first delivery would otherwise be sent the whole snapshot again, labelled
    // as something new.
    expect(response.headers.get('etag')).toBe('"1"')
    expect(((await response.json()) as PlaylistTracks).version).toBe(1)
  })

  it('records the Tracks once, not once per delivery', async () => {
    await createPlaylist('stub:playlist:recorded-twice')
    await resolvePlaylist('stub:recorded-twice')
    await resolvePlaylist('stub:recorded-twice')

    // A Track is in a Playlist at most once at a time. Membership is keyed by
    // the instant it was added, so a second delivery a second later would
    // otherwise write a parallel set of rows -- and DESIGN section 02's whole
    // reason for D1 is that a snapshot can be rebuilt from it.
    expect(await membershipOf('stub:recorded-twice')).toBe(3)
  })

  it('still records that the Resolution happened', async () => {
    await createPlaylist('stub:playlist:looked-again')
    await resolvePlaylist('stub:looked-again')
    await resolvePlaylist('stub:looked-again')

    // Finding nothing changed is a Resolution that succeeded, not one that was
    // skipped. The refresh that eventually schedules these reads the instant to
    // decide what is due, and a Playlist that never records being looked at is
    // one it would pick again immediately.
    const row = await playlistRow('stub:looked-again')
    expect(row).toMatchObject({ status: 'ok', version: 1 })
    expect(row?.last_refreshed_at).not.toBeNull()
  })
})

describe('a Resolution delivered again after its Tracks were stored', () => {
  it('leaves one set of membership rows behind, not two', async () => {
    await createPlaylist('stub:playlist:half-written')

    // A minute between the two, and the clock is held still to guarantee it.
    // Membership records the instant a Track joined, so two Resolutions in the
    // same second collide on that instant and the second is refused for the
    // wrong reason -- which would make this pass without proving anything.
    const clock = vi.spyOn(Date, 'now')

    try {
      clock.mockReturnValue(1_700_000_000_000)

      // The Tracks reach D1 and the snapshot never reaches the cache, so the
      // redelivery has no served Version to compare itself against and runs the
      // whole Resolution again.
      await expect(
        resolvePlaylist('stub:half-written', { CACHE: refusingToStore(env.CACHE) }),
      ).rejects.toThrow()

      clock.mockReturnValue(1_700_000_060_000)
      await resolvePlaylist('stub:half-written')
    } finally {
      clock.mockRestore()
    }

    expect(await membershipOf('stub:half-written')).toBe(3)
  })
})

describe('a Resolution delivered again after its row was left behind', () => {
  it('names the next Version after what is served, not after the row', async () => {
    const sourceId = '2BBBBBBBBBBBBBBBBBBBBB'
    const id = `spotify:${sourceId}`
    await createPlaylist(`https://open.spotify.com/playlist/${sourceId}`)

    // Version 1 is written and served, and the row cannot catch up to it.
    const first = spotifyServing(onePage)
    await expect(
      insteadOfTheNetwork(first.answer, () =>
        resolvePlaylist(id, { ...CREDENTIALS, DB: refusingUpdates(env.DB) }),
      ),
    ).rejects.toThrow()

    // Delivered again, and this time the Source has something else to say.
    const second = spotifyServing(severalArtists)
    await insteadOfTheNetwork(second.answer, () => resolvePlaylist(id, CREDENTIALS))

    // The point of the whole write order: a client holding Version 1 must never
    // be told it is current when what it holds is not what Version 1 means. If
    // the next Version were counted from the row, this second Resolution would
    // have written different contents over the key Version 1 names, and this
    // request would answer 304.
    const holding = await tracksOf(id, { 'if-none-match': '"1"' })
    expect(holding.status).toBe(200)

    const body = (await holding.json()) as PlaylistTracks
    expect(body.version).toBe(2)
    expect(body.tracks).toHaveLength(39)
  })

  it('lets the row catch up when nothing changed', async () => {
    await createPlaylist('stub:playlist:row-left-behind')

    await expect(
      resolvePlaylist('stub:row-left-behind', { DB: refusingUpdates(env.DB) }),
    ).rejects.toThrow()

    await resolvePlaylist('stub:row-left-behind')

    // Observable from outside: adding it again says the Tracks are there.
    // Without the row catching up, a Playlist that is serving Tracks would keep
    // telling every add to poll for them, for ever.
    const again = await createPlaylist('stub:playlist:row-left-behind')

    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ id: 'stub:row-left-behind', status: 'ok' })
  })
})
