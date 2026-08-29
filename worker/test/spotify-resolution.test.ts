import { describe, expect, it } from 'vitest'
import type { PlaylistTracks } from '@jukebox/schema'
import {
  FIXTURE_BEARER,
  TOKEN_ADDRESS,
  TOKEN_REQUEST,
  itemsAddress,
  spotifyServing,
} from '../src/sources/spotify/__fixtures__/network'
import onePage from '../src/sources/spotify/__fixtures__/one-page.json'
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
 * The consumer is handed these the way it is handed a stand-in for the
 * network: through its own boundary, with nothing in the worker knowing it
 * happened. They are here rather than in the test environment's config so that
 * they sit beside the assertion about what is done with them.
 */
const CREDENTIALS = {
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
}

/** base64 of `test-client-id:test-client-secret`. */
const BASIC = 'dGVzdC1jbGllbnQtaWQ6dGVzdC1jbGllbnQtc2VjcmV0'

/**
 * Adds a Playlist and resolves it with the Source standing still.
 *
 * Takes the Source's own id and derives both the address a person would paste
 * and the Playlist id ADR-0001 gives it, so the two cannot disagree. Each test
 * uses a different one, as the neighbouring suites do: it keeps what a test
 * left behind out of the next one's way even when they share storage.
 */
const resolveAgainstSpotify = async (sourceId: string) => {
  await createPlaylist(`https://open.spotify.com/playlist/${sourceId}`)

  const spotify = spotifyServing(onePage)
  await insteadOfTheNetwork(spotify.answer, () =>
    resolvePlaylist(`spotify:${sourceId}`, CREDENTIALS),
  )

  return spotify
}

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
      authorization: `Basic ${BASIC}`,
      body: TOKEN_REQUEST,
    })
  })

  it('reads the playlist with the token it was just given', async () => {
    const { calls } = await resolveAgainstSpotify('7JQrxQmrwXvOnCdx7LNs07')

    // The captured token response carries a placeholder, so a request bearing
    // anything else did not get its credential from that answer.
    expect(calls[1]?.authorization).toBe(FIXTURE_BEARER)
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
    expect(calls[1]?.url).toBe(itemsAddress('1AAAAAAAAAAAAAAAAAAAAA', 0))
  })

  it('reads one page and makes no other request', async () => {
    const { calls } = await resolveAgainstSpotify('5AAAAAAAAAAAAAAAAAAAAA')

    // A token and a page. A playlist longer than one page is read no further
    // than this -- #12 adds the walk, and this is what will change when it does.
    expect(calls).toHaveLength(2)
  })
})
