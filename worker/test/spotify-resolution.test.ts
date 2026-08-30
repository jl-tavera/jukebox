import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { PlaylistTracks } from '@jukebox/schema'
import {
  CREDENTIALS,
  FIXTURE_BASIC,
  FIXTURE_BEARER,
  FIXTURE_TITLE,
  TOKEN_ADDRESS,
  TOKEN_REQUEST,
  itemsAddress,
  metadataAddress,
  pagesOf,
  spotifyServing,
  spotifyServingNameless,
  type StandingIn,
} from '../src/sources/spotify/__fixtures__/network'
import mixedEntries from '../src/sources/spotify/__fixtures__/mixed-entries.json'
import multiPage0 from '../src/sources/spotify/__fixtures__/multi-page-offset-0.json'
import multiPage50 from '../src/sources/spotify/__fixtures__/multi-page-offset-50.json'
import onePage from '../src/sources/spotify/__fixtures__/one-page.json'
import type { ItemsResponse } from '../src/sources/spotify/payloads'
import { createPlaylist, insteadOfTheNetwork, resolvePlaylist, tracksOf } from './api'

/**
 * A Spotify Playlist all the way through: added over HTTP, resolved by the
 * consumer against a Source standing still, and served back carrying a
 * Version. The same path `resolution.test.ts` drives with the stub -- which is
 * this ticket's point, and why that file needed no edit.
 *
 * What a correct request looks like is imported rather than written here.
 * DESIGN section 03 keeps the Source's vocabulary -- its endpoints, its query,
 * its grant -- inside the adapter directory, and a test is not an exception to
 * that; `__fixtures__/network.ts` holds it, beside the responses it describes.
 */

/**
 * Adds a Playlist and resolves it with the Source standing still.
 *
 * Takes the Source's own id and derives both the address a person would paste
 * and the Playlist id ADR-0001 gives it, so the two cannot disagree. Each test
 * uses a different one, as the neighbouring suites do: it keeps what a test
 * left behind out of the next one's way even when they share storage.
 *
 */
const resolveWith = async (spotify: StandingIn, sourceId: string) => {
  await createPlaylist(`https://open.spotify.com/playlist/${sourceId}`)

  await insteadOfTheNetwork(spotify.answer, () =>
    resolvePlaylist(`spotify:${sourceId}`, CREDENTIALS),
  )

  return spotify
}

/**
 * Against a Source answering out of the captured responses. The pages default
 * to the one captured single-page playlist, so a test that is not about the
 * walk says nothing about paging.
 */
const resolveAgainstSpotify = (sourceId: string, ...pages: ItemsResponse[]) =>
  resolveWith(spotifyServing(...(pages.length > 0 ? pages : [onePage])), sourceId)

/**
 * Against a Source that will not say what the Playlist is called.
 *
 * One case here rather than the four `normalize.test.ts` drives. What is worth
 * a whole Resolution is that an absent name reaches a reader as an absent
 * title; which of the four ways the Source withheld it is decided one function
 * in, and is tested there.
 */
const resolveAgainstNamelessSpotify = (sourceId: string) =>
  resolveWith(spotifyServingNameless(onePage), sourceId)

describe('a Spotify Playlist resolved against the Source', () => {
  it('comes back over HTTP as Tracks carrying a Version', async () => {
    await resolveAgainstSpotify('3cEYpjA9oz9GiPac4AsH4n')

    const response = await tracksOf('spotify:3cEYpjA9oz9GiPac4AsH4n')
    const body = (await response.json()) as PlaylistTracks

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"1"')
    expect(body.version).toBe(1)
    expect(body.skipped).toBe(0)
    expect(body.tracks).toHaveLength(5)
    expect(body.tracks[0]).toEqual({
      sourceTrackId: '4rzfv0JLZfVhOhbSQ8o5jZ',
      title: 'Api',
      artists: ['Odiseo'],
      album: 'Progressive Psy Trance Picks Vol.8',
      durationMs: 376_000,
      isrc: 'DEKC41200989',
      position: 0,
      coverImageUrl: 'https://i.scdn.co/image/ab67616d0000b273ce6d0eef0c1ce77e5f95bbbc',
    })
  })
})

describe('how the consumer authenticates', () => {
  it('asks for a token with the Client Credentials flow', async () => {
    const { calls } = await resolveAgainstSpotify('03Xz4NcdaWjZq2T6sKNLui')

    // No user, no redirect, no consent screen: the flow that lets a worker
    // nobody is logged into read a public playlist.
    expect(calls[0]).toMatchObject({
      url: TOKEN_ADDRESS,
      method: 'POST',
      authorization: FIXTURE_BASIC,
      body: TOKEN_REQUEST,
    })
  })

  it('reads the playlist with the token it was just given', async () => {
    const { calls } = await resolveAgainstSpotify('7JQrxQmrwXvOnCdx7LNs07')

    // The captured token response carries a placeholder, so a request bearing
    // anything else did not get its credential from that answer. Both reads are
    // checked because there are two of them now, and one going out unsigned
    // would come back 401 and read as a token the Source rejected.
    expect(calls[1]?.authorization).toBe(FIXTURE_BEARER)
    expect(calls[2]?.authorization).toBe(FIXTURE_BEARER)
  })

  it('gets a fresh token for each Resolution rather than keeping one', async () => {
    const first = await resolveAgainstSpotify('6M6POvx8hfKqsM1G8z1Pz5')
    const second = await resolveAgainstSpotify('2JxNo3xcSFEXUdU7CrKgYn')

    // One token request each. Caching them is a later optimisation, and this is
    // what would notice it arriving unannounced.
    expect(first.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
    expect(second.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })
})

describe('the request the consumer makes for a playlist', () => {
  it('asks for a page it addressed itself, naming no region', async () => {
    const { calls } = await resolveAgainstSpotify('1AAAAAAAAAAAAAAAAAAAAA')

    // Exactly, not merely near enough. Two things ride on the whole address:
    // the page is addressed by offset rather than by following the Source's own
    // paging link, which drops the parameter that keeps a podcast episode
    // shaped like one (MANIFEST.md finding 5); and no region is named, because
    // DESIGN section 05 caches one answer for every caller and a region-scoped
    // response would quietly make that cache region-specific.
    expect(calls[2]?.url).toBe(itemsAddress('1AAAAAAAAAAAAAAAAAAAAA', 0))
  })

  it('stops after one page when the Source says there is no other', async () => {
    const { calls } = await resolveAgainstSpotify('5AAAAAAAAAAAAAAAAAAAAA')

    // A token, the playlist's own metadata and a page, and no speculative
    // second page: the walk asks for another only when the Source said there is
    // one. A playlist that fits on one page therefore costs exactly one page
    // read, as it did before the walk existed.
    expect(calls).toHaveLength(3)
  })
})

describe('a playlist longer than one page', () => {
  it('resolves completely, across every page the Source offers', async () => {
    // 69 entries over two pages, captured from one real playlist -- so what is
    // under test is bytes Spotify actually sent, joined at a boundary it chose.
    await resolveAgainstSpotify('03Xz4NcdaWjZq2T6sKNLui', multiPage0, multiPage50)

    const body = (await (await tracksOf('spotify:03Xz4NcdaWjZq2T6sKNLui')).json()) as PlaylistTracks

    expect(body.tracks).toHaveLength(69)
    // Unbroken across the join, which is what says the second page was placed
    // after the first rather than counted from its own start.
    expect(body.tracks.map((track) => track.position)).toEqual([...Array(69).keys()])
  })

  it('addresses each page itself rather than following the Source', async () => {
    const { calls } = await resolveAgainstSpotify('4AAAAAAAAAAAAAAAAAAAAA', multiPage0, multiPage50)

    // Exactly these, in this order. The captured `next` on the first page names
    // an address without `additional_types=episode`, so a walk that followed it
    // would have asked for something different from this -- and would have been
    // answered with track-shaped episodes from the second page on. MANIFEST.md
    // finding 5.
    expect(calls.map((call) => call.url)).toEqual([
      TOKEN_ADDRESS,
      metadataAddress('4AAAAAAAAAAAAAAAAAAAAA'),
      itemsAddress('4AAAAAAAAAAAAAAAAAAAAA', 0),
      itemsAddress('4AAAAAAAAAAAAAAAAAAAAA', 50),
    ])
  })

  it('reads a playlist of two hundred entries as two hundred Tracks', async () => {
    // Constructed, not captured: no public playlist held still long enough to
    // be worth committing 200 entries of, and what this asks is arithmetic --
    // that four pages yield four pages' worth. `pagesOf` says why it is built
    // in memory rather than written into __fixtures__.
    const id = '6AAAAAAAAAAAAAAAAAAAAA'
    const { calls } = await resolveAgainstSpotify(id, ...pagesOf(200, id))

    const body = (await (await tracksOf(`spotify:${id}`)).json()) as PlaylistTracks

    expect(body.tracks).toHaveLength(200)
    expect(body.tracks.map((track) => track.position)).toEqual([...Array(200).keys()])
    expect(calls.map((call) => call.url)).toEqual([
      TOKEN_ADDRESS,
      metadataAddress(id),
      ...[0, 50, 100, 150].map((offset) => itemsAddress(id, offset)),
    ])
  })

  it('asks for one token however many pages it reads', async () => {
    const id = '7AAAAAAAAAAAAAAAAAAAAA'
    const { calls } = await resolveAgainstSpotify(id, ...pagesOf(200, id))

    // Still one, not one per page. The token is obtained before the walk, and
    // a careless walk would move it inside.
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })
})

describe('the entries a playlist holds that are not Tracks', () => {
  it('leaves them out of the Tracks and counts them into skipped', async () => {
    // Six entries: three tracks, a podcast episode, a local file and one the
    // Source will no longer serve. No public playlist holds all three kinds at
    // once, so this one is composed from real entries -- MANIFEST.md says which
    // came from where.
    const id = '9AAAAAAAAAAAAAAAAAAAAA'
    await resolveAgainstSpotify(id, mixedEntries as unknown as ItemsResponse)

    const body = (await (await tracksOf(`spotify:${id}`)).json()) as PlaylistTracks

    expect(body.tracks).toHaveLength(3)
    // Counted rather than dropped silently: three of six against a Source
    // showing six should not read as data loss.
    expect(body.skipped).toBe(3)
    // The Source's own indices, so what was left out leaves a visible gap
    // rather than renumbering what follows it.
    expect(body.tracks.map((track) => track.position)).toEqual([0, 2, 5])
  })
})

describe('the name a Playlist has on its Source', () => {
  it('survives the post, the Resolution and the read', async () => {
    await resolveAgainstSpotify('1BBBBBBBBBBBBBBBBBBBBB')

    const body = (await (await tracksOf('spotify:1BBBBBBBBBBBBBBBBBBBBB')).json()) as PlaylistTracks

    // Written out rather than read from the fixture, for the reason every
    // expected value in `normalize.test.ts` is: an assertion that reads the
    // capture the way the code does agrees with it however wrong both are.
    expect(body.title).toBe(FIXTURE_TITLE)
  })

  it('is read from the playlist itself, before any of its entries', async () => {
    const { calls } = await resolveAgainstSpotify('2BBBBBBBBBBBBBBBBBBBBB')

    // The plain address, with nothing appended, and ahead of the walk. Both
    // are the adapter's decisions and `playlistMetadata` holds the reasons for
    // them; what this pins is that they are still true -- which nothing short
    // of the whole call list, in order, can say.
    expect(calls.map((call) => call.url)).toEqual([
      TOKEN_ADDRESS,
      metadataAddress('2BBBBBBBBBBBBBBBBBBBBB'),
      itemsAddress('2BBBBBBBBBBBBBBBBBBBBB', 0),
    ])
  })

  it('is written to the Playlist row, which has had a column for it all along', async () => {
    await resolveAgainstSpotify('3BBBBBBBBBBBBBBBBBBBBB')

    // Nothing reads this column yet -- the served title comes out of the
    // snapshot. It is written because the row is what says where a Playlist has
    // got to, and one whose Tracks name it while D1 does not is a row the
    // Refresh that eventually schedules these would have to read the Source
    // again to complete.
    const row = await env.DB.prepare('SELECT title FROM playlists WHERE id = ?')
      .bind('spotify:3BBBBBBBBBBBBBBBBBBBBB')
      .first<{ title: string | null }>()

    expect(row?.title).toBe(FIXTURE_TITLE)
  })
})

describe('a Playlist its Source offers no usable name for', () => {
  it('is served without a title rather than under an invented one', async () => {
    await resolveAgainstNamelessSpotify('4BBBBBBBBBBBBBBBBBBBBB')

    const response = await tracksOf('spotify:4BBBBBBBBBBBBBBBBBBBBB')
    const body = (await response.json()) as PlaylistTracks

    // Resolved, served, and honest about the one thing it does not know. A
    // placeholder would reach whoever saw it looking like a name somebody
    // chose, and no reader could tell the two apart. `normalize.test.ts` drives
    // the four shapes an unusable name arrives in; this drives what a reader is
    // handed for one of them.
    expect(response.status).toBe(200)
    expect(body.title).toBeNull()
    expect(body.tracks).toHaveLength(5)
  })
})

describe('a playlist with nothing in it', () => {
  it('resolves to a Version carrying no Tracks, which is not the same as Pending', async () => {
    // Reachable for the first time here: every captured playlist has entries,
    // and before the walk an empty page could only mean a request that went
    // wrong. `PendingTracks` exists precisely so a client can tell "no Tracks
    // yet" from "resolved to nothing" -- this is the second.
    const id = '8AAAAAAAAAAAAAAAAAAAAA'
    await resolveAgainstSpotify(id, { items: [], next: null })

    const response = await tracksOf(`spotify:${id}`)
    const body = (await response.json()) as PlaylistTracks

    expect(response.status).toBe(200)
    expect(body).toEqual({ version: 1, title: FIXTURE_TITLE, skipped: 0, tracks: [] })
  })
})
