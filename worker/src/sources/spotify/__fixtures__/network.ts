import type { ItemsPage } from '../payloads'
import token from './token.json'

/**
 * Spotify, standing still. It answers the two requests a Resolution makes out
 * of the captured responses beside it, and records what it was asked.
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

/** The placeholder `token.json` carries, as it arrives on a request. */
export const FIXTURE_BEARER = 'Bearer FIXTURE-NOT-A-REAL-TOKEN'

/**
 * The address of one page of a playlist's entries: addressed by offset, asking
 * for episodes explicitly, and naming no market.
 */
export const itemsAddress = (sourceId: string, offset: number): string =>
  `https://api.spotify.com/v1/playlists/${sourceId}/items` +
  `?offset=${offset}&limit=50&additional_types=track,episode`

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

/** Answers a playlist read with `page`, and a token request with the captured one. */
export const spotifyServing = (page: ItemsPage): StandingIn => {
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
    if (ITEMS.test(request.url)) return Response.json(page)

    // Loudly, and naming the address: a stand-in that answers something
    // plausible to a request nobody meant to make is worse than no stand-in.
    throw new Error(`nothing here stands in for ${request.url}`)
  }

  return { answer, calls }
}
