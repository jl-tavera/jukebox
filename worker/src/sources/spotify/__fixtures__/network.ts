import type { ItemsResponse, PlaylistEntry } from '../payloads'
import gone from './gone-404.json'
import onePage from './one-page.json'
import token from './token.json'

/**
 * Spotify, standing still. It answers the requests a Resolution makes out of
 * the captured responses beside it, and records what it was asked.
 *
 * It lives in this directory for the reason `capture.ts` does: it is written in
 * Spotify's vocabulary -- the token endpoint, the bearer, the shape of a page
 * request -- which DESIGN section 03 confines to the adapter. Nothing in `src/`
 * imports it, so none of it reaches the deployed worker.
 *
 * Requests are recorded as the fields a test asks about rather than as
 * `Request` objects: a body can only be read once, so it is read here, while
 * the request is still in hand.
 */

const TOKEN = 'https://accounts.spotify.com/api/token'

/**
 * Loose on purpose. The stand-in answers any playlist read, so a request built
 * wrongly still gets a reply and fails on what a test asserts about it, rather
 * than on this throwing -- which would report every mistake as the same one.
 */
const ITEMS = /^https:\/\/api\.spotify\.com\/v1\/playlists\/[A-Za-z0-9]+\/items(\?|$)/

/** Spotify's cap, and the size every page here is cut to. */
const PAGE_SIZE = 50

/**
 * What a correct Resolution asks for. This is the MANIFEST's "Request shape"
 * section made executable, and it is written out here rather than imported
 * from the adapter on purpose: a test that built its expectation with the same
 * code under test would agree with it however wrong both were.
 *
 * It lives in this directory because it is Spotify's vocabulary -- the token
 * endpoint, the query, the grant -- which DESIGN section 03 confines to the
 * adapter. A test can then assert on the request without being written in the
 * Source's words itself.
 */
export const TOKEN_ADDRESS = TOKEN

/** The Client Credentials grant, form-encoded. No user, no redirect. */
export const TOKEN_REQUEST = 'grant_type=client_credentials'

/**
 * What a test hands the consumer in place of the real secrets. Here rather than
 * in each suite because the names are Spotify's, and because a Resolution
 * driven against the stand-in should be asking for a token with the same
 * credential wherever it is driven from.
 */
export const CREDENTIALS = {
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
}

/** base64 of the two above, as `accessToken` sends them. */
export const FIXTURE_BASIC = 'Basic dGVzdC1jbGllbnQtaWQ6dGVzdC1jbGllbnQtc2VjcmV0'

/** The placeholder `token.json` carries, as it arrives on a request. */
export const FIXTURE_BEARER = 'Bearer FIXTURE-NOT-A-REAL-TOKEN'

/**
 * The address of one page of a playlist's entries: addressed by offset, asking
 * for episodes explicitly, and naming no market.
 */
export const itemsAddress = (sourceId: string, offset: number): string =>
  `https://api.spotify.com/v1/playlists/${sourceId}/items` +
  `?offset=${offset}&limit=${PAGE_SIZE}&additional_types=track,episode`

export interface SpotifyCall {
  readonly url: string
  readonly method: string
  readonly authorization: string | null
  readonly body: string | null
}

export interface StandingIn {
  /** Hand this to `insteadOfTheNetwork`. */
  readonly answer: typeof globalThis.fetch
  /** Every request made, in order. */
  readonly calls: SpotifyCall[]
}

/**
 * The recording half, shared by every stand-in below. `reply` decides what a
 * playlist read is answered with; the token is always the captured one, since
 * no test here is about authentication failing.
 */
const recording = (reply: (request: Request) => Response): StandingIn => {
  const calls: SpotifyCall[] = []

  const answer: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)

    calls.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get('authorization'),
      // Decoded from the bytes rather than read with `.text()`, which warns
      // when the body is form-encoded and it is being read as text anyway.
      body:
        request.method === 'POST'
          ? new TextDecoder().decode(await request.arrayBuffer())
          : null,
    })

    if (request.url === TOKEN) return Response.json(token)
    if (ITEMS.test(request.url)) return reply(request)

    // Loudly, and naming the address: a stand-in that answers something
    // plausible to a request nobody meant to make is worse than no stand-in.
    throw new Error(`nothing here stands in for ${request.url}`)
  }

  return { answer, calls }
}

/**
 * Answers a playlist read out of `pages`, keyed on the `offset` asked for.
 *
 * Keyed rather than answering every read with the same page, because a walk
 * driven by a stand-in that repeats itself would either loop forever or agree
 * with a walk that never moved. The parameter is `ItemsResponse`, so a page
 * whose `next` is set cannot be handed over alone: the walk would ask for a
 * second page that was never provided, and this would throw rather than hang.
 */
export const spotifyServing = (...pages: readonly ItemsResponse[]): StandingIn =>
  recording((request) => {
    const offset = Number(new URL(request.url).searchParams.get('offset'))
    const page = pages[offset / PAGE_SIZE]

    if (page === undefined) {
      throw new Error(`nothing here stands in for the page at offset ${offset}`)
    }

    return Response.json(page)
  })

/**
 * Answers every playlist read with `status`, while the token still comes back
 * fine -- a Source refusing one Playlist, which is a different thing from a
 * Source nobody can reach.
 *
 * The body is built here rather than passed in, for the reason `itemsAddress`
 * is exported rather than written out by each test: an error envelope is
 * Spotify's shape, and DESIGN section 03 keeps Spotify's shapes in this
 * directory. A 404 answers the captured bytes themselves; anything else wears
 * the same envelope, which is all any caller reads of it -- nothing in the
 * adapter looks past the status.
 */
export const spotifyRefusing = (status: number): StandingIn =>
  recording(() =>
    Response.json(status === 404 ? gone : { error: { status, message: 'Server error.' } }, {
      status,
    }),
  )

/**
 * `entries` playlist entries, cut into pages the way Spotify cuts them.
 *
 * Constructed in memory and never written to disk. Every file in this directory
 * is evidence about Spotify, captured from it and re-cuttable by `capture.ts`;
 * a few hundred invented entries would be arithmetic wearing a capture's
 * clothes, and would triple the directory to say nothing about the Source. What
 * it is for is the arithmetic: that a walk of four pages yields four pages'
 * worth of Tracks, which no captured playlist is long enough to show.
 *
 * Each entry is a real captured one with a distinct id, because a Track's id is
 * derived from the Source's and repeats would collapse into one stored row.
 */
export const pagesOf = (entries: number, sourceId: string): ItemsResponse[] => {
  const donor = onePage.items[0] as unknown as PlaylistEntry
  const pages: ItemsResponse[] = []

  for (let offset = 0; offset < entries; offset += PAGE_SIZE) {
    const items = Array.from(
      { length: Math.min(PAGE_SIZE, entries - offset) },
      (_unused, index): PlaylistEntry => {
        const entry = structuredClone(donor)
        // 22 base62 characters, the length every Spotify id has and the length
        // the adapter's own pattern insists on.
        const id = `P${String(offset + index).padStart(21, '0')}`
        return { ...entry, item: { ...entry.item!, id, name: `Track ${offset + index}` } }
      },
    )

    const after = offset + items.length
    pages.push({ items, next: after < entries ? itemsAddress(sourceId, after) : null })
  }

  return pages
}
