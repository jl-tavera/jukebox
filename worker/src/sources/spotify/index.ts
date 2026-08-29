import type { PlaylistSource } from '../registry'

/**
 * The Spotify Source adapter. Reached only through the registry: nothing
 * outside this directory imports it, which is what makes Apple Music additive
 * rather than an audit of every call site.
 *
 * `claims` and `parse` are real; `fetch` and `normalize` are #11's, and refuse
 * loudly until then. A Spotify Playlist added today is therefore tracked and
 * its Resolution fails -- which is the true state of things, and better said
 * out loud than hidden behind an interface member every call site has to guard
 * for. The stub Source is what exercises the Resolution path meanwhile.
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

export const spotify: PlaylistSource = {
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

  fetch: () => {
    throw new Error('reading a playlist from Spotify is not written yet')
  },

  normalize: () => {
    throw new Error('normalizing a Spotify playlist is not written yet')
  },
}
