import type { PlaylistSource } from '../registry'
import { normalize } from './normalize'
import type { ItemsPage } from './payloads'

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
const itemsPage = async (sourceId: string, offset: number, bearer: string): Promise<ItemsPage> => {
  const address =
    `${API}/playlists/${sourceId}/items` +
    `?offset=${offset}&limit=${PAGE_SIZE}&additional_types=track,episode`

  const response = await fetch(address, { headers: { authorization: `Bearer ${bearer}` } })

  // Thrown rather than answered, so the Resolution fails and the queue delivers
  // it again. Telling a 404 (the Playlist is Gone) apart from a 503 (try later)
  // is #12's, and until then every failure is treated as worth retrying.
  if (!response.ok) {
    throw new Error(`Spotify would not serve playlist ${sourceId}: ${response.status}`)
  }

  return response.json<ItemsPage>()
}

export const spotify: PlaylistSource<ItemsPage[]> = {
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
   * One page today. A playlist longer than 50 entries is read as far as its
   * first page and no further -- #12 adds the walk, where the criterion for it
   * lives, and this returning a list is the shape that walk pushes into.
   */
  fetch: async (sourceId, env) => [await itemsPage(sourceId, 0, await accessToken(env))],

  normalize,
}
