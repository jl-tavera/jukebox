import { PlaylistGone } from '../gone'
import type { PlaylistSource } from '../registry'
import { normalize } from './normalize'
import type { ItemsResponse } from './payloads'

/**
 * The Spotify Source adapter. Reached only through the registry: nothing
 * outside this directory imports it, which is what makes Apple Music additive
 * rather than an audit of every call site.
 */

/**
 * A Spotify id is 22 base62 characters. Every donor in `__fixtures__/MANIFEST.md`
 * is, including `1AAAAAAAAAAAAAAAAAAAAA` -- the well-formed id that names no
 * playlist. Pinning the length is what lets a mistyped address be answered
 * immediately, rather than sitting Pending until a Resolution comes back Gone
 * and blames a deleted or private playlist for a typo.
 */
const SOURCE_ID_PATTERN = /^[A-Za-z0-9]{22}$/

/** What the desktop app's "Copy Spotify URI" puts on the clipboard. */
const DESKTOP_URI = /^spotify:playlist:([A-Za-z0-9]{22})$/

/**
 * What the web player prefixes its path with for a browser that is not in
 * English: `open.spotify.com/intl-es/playlist/...`, and region-qualified as
 * `intl-pt-BR`. It names a language, not a playlist, so it is dropped.
 */
const LOCALE_SEGMENT = /^intl-[a-z]{2}(-[a-z]{2})?$/i

const WEB_HOST = 'open.spotify.com'

/**
 * The one place a URL is read. `claims` and `parse` are both this function, so
 * they cannot disagree about which addresses are Spotify's -- a URL claims
 * exactly when it parses.
 */
const sourceIdFrom = (input: string): string | undefined => {
  const raw = input.trim()

  const uri = DESKTOP_URI.exec(raw)
  if (uri) return uri[1]

  let address: URL
  try {
    address = new URL(raw)
  } catch {
    return undefined
  }

  // Spotify serves these over https and nothing else hands one out over
  // http, so accepting it would be surface with no address behind it.
  if (address.protocol !== 'https:') return undefined
  if (address.hostname !== WEB_HOST) return undefined

  // The query holds the `si` parameter Spotify's Share button appends, and the
  // first segment may hold a locale. Neither changes which playlist this is.
  const segments = address.pathname.split('/').filter(Boolean)
  const path = LOCALE_SEGMENT.test(segments[0] ?? '') ? segments.slice(1) : segments
  if (path.length !== 2 || path[0] !== 'playlist') return undefined

  const sourceId = path[1]
  return SOURCE_ID_PATTERN.test(sourceId) ? sourceId : undefined
}

const ACCOUNTS = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

/** Spotify caps this at 50, so a longer playlist is more than one request. */
const PAGE_SIZE = 50

/**
 * How far this walk will go before it decides it is not reading a playlist.
 *
 * Ours, not Spotify's. Spotify is widely said to cap a playlist at 10,000
 * entries and nothing in `__fixtures__/` captures that, so it is not claimed
 * here as a fact about the Source -- it is a number picked to sit well above
 * any playlist we expect and well below a loop that never ends. Whether to ask
 * for another page is decided by the answer to the last one, which arrives off
 * a network, and a consumer that keeps believing it would spend its fifteen
 * minutes and the project's upstream budget on nothing.
 *
 * Reaching it is an error rather than a stopping place. A Playlist read this
 * far and no further is a short answer, and a short answer handed back as a
 * whole one is the silent shortfall `skipped` exists to refuse.
 */
const WALK_CEILING = 10_000

/**
 * A token for the Client Credentials flow -- no user, no redirect, no consent
 * screen, which is what lets a worker nobody is logged into read a public
 * playlist. DESIGN section 10 rules out user OAuth, so this is the only flow
 * Jukebox has.
 *
 * One token per Resolution. Caching them in KV is a later optimisation, correct
 * to make when the scheduled refresh fans out widely enough for the token
 * endpoint to matter.
 */
const accessToken = async (env: Env): Promise<string> => {
  const id = env.SPOTIFY_CLIENT_ID
  const secret = env.SPOTIFY_CLIENT_SECRET

  // Said plainly and early. Without this the request goes out as
  // `Basic ` + btoa('undefined:undefined') and comes back 401, which reads as
  // a credential Spotify rejected rather than one that was never delivered.
  if (!id || !secret) {
    throw new Error(
      'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are not set on this worker. ' +
        'Deployed environments get them from `wrangler secret put`; local ones read .dev.vars.',
    )
  }

  const response = await fetch(ACCOUNTS, {
    method: 'POST',
    headers: {
      // `btoa`, not `Buffer`: `nodejs_compat` is off, and turning it on to
      // encode 60 characters would be a runtime-wide change for nothing.
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error(`Spotify would not issue a token: ${response.status}`)
  }

  const { access_token } = await response.json<{ access_token: string }>()
  return access_token
}

/**
 * One request's worth of playlist entries.
 *
 * The page is addressed by `offset` rather than by following the `next` link
 * Spotify puts in its own answer. That link drops `additional_types=episode`,
 * so a walk that follows it verbatim sees true episode shapes on the first
 * page and track-shaped episodes on every one after -- MANIFEST.md finding 5.
 * Addressing pages ourselves means every page is asked for the same way.
 *
 * `next` is still read, in `fetch` above: whether there is another page and
 * where that page lives are different questions, and only the second one is
 * the one finding 5 says not to take Spotify's word for.
 *
 * The query is written out rather than built with `URLSearchParams`, which
 * percent-encodes the comma into `track%2Cepisode`. Spotify accepts that, but
 * every captured response was taken with this exact query, and a request that
 * differs from the one the fixtures describe is one nothing has evidence
 * about.
 *
 * `additional_types=track,episode` fixes the *shape* of an episode entry, not
 * whether one appears -- without it an episode still arrives typed "episode"
 * but wearing a track's clothes. `normalize` says why that matters.
 *
 * No market is named. DESIGN section 05 caches one answer for every caller,
 * and a region-scoped response would quietly make that cache region-specific.
 */
const itemsPage = async (
  sourceId: string,
  offset: number,
  bearer: string,
): Promise<ItemsResponse> => {
  const address =
    `${API}/playlists/${sourceId}/items` +
    `?offset=${offset}&limit=${PAGE_SIZE}&additional_types=track,episode`

  const response = await fetch(address, { headers: { authorization: `Bearer ${bearer}` } })

  // The one status that says something about the Playlist rather than about us
  // or about Spotify. A deleted playlist, a private one and one Spotify curates
  // itself all answer 404 -- `gone-404.json` and `curated-404.json` are byte for
  // byte identical captures of two of the three -- so one answer covers them,
  // and none of them is helped by asking again.
  if (response.status === 404) {
    throw new PlaylistGone(`Spotify does not have a playlist ${sourceId}`)
  }

  // Everything else is about the credential we sent, the rate we sent it at, or
  // Spotify's own health: a 401, a 403, a 429, a 500. None of those is a fact
  // about the Playlist, and all of them can be different in a minute, so they
  // are thrown plainly and the queue delivers the Resolution again.
  if (!response.ok) {
    throw new Error(`Spotify would not serve playlist ${sourceId}: ${response.status}`)
  }

  return response.json<ItemsResponse>()
}

export const spotify: PlaylistSource<ItemsResponse[]> = {
  id: 'spotify',

  claims: (url) => sourceIdFrom(url) !== undefined,

  parse: (url) => {
    const sourceId = sourceIdFrom(url)
    // Unreachable through the registry, which only reaches an adapter that has
    // already claimed the URL. It throws rather than returning null so that a
    // future caller which skips `claims` fails loudly instead of storing a
    // Playlist with no id.
    if (sourceId === undefined) throw new Error('no Spotify playlist in this URL')
    return { sourceId }
  },

  /**
   * The one expensive call, reached only from the Resolution consumer.
   *
   * The pages are answered rather than flattened here, so what `normalize`
   * reads is what Spotify actually said and in the order it was asked for.
   *
   * The walk is sequential, and cannot be anything else: whether there is
   * another page is in the answer to this one. One token covers all of them --
   * it is obtained before the first request rather than inside the loop, which
   * would ask the token endpoint once per page for nothing.
   */
  fetch: async (sourceId, env) => {
    const bearer = await accessToken(env)
    const pages: ItemsResponse[] = []

    for (let offset = 0; offset < WALK_CEILING; offset += PAGE_SIZE) {
      const page = await itemsPage(sourceId, offset, bearer)
      pages.push(page)

      // The Source's own answer to whether there is more, read and not
      // followed. Counting entries against `total` would work as well until the
      // playlist changed under the walk; this is the field Spotify computes for
      // the window actually asked for.
      if (page.next === null) return pages

      // Spotify named another page and gave nothing to place it after. Trusting
      // `next` and asking again would loop; stopping would hand back a short
      // playlist as a complete one and move its Version to say so. Failing means
      // the Resolution is delivered again, which is the honest answer to a
      // Source contradicting itself.
      if (page.items.length === 0) {
        throw new Error(`Spotify offered a page of playlist ${sourceId} after an empty one`)
      }
    }

    throw new Error(
      `playlist ${sourceId} did not end within the ${WALK_CEILING} entries this walk will read`,
    )
  },

  normalize,
}
