import type { NormalizedPlaylist, PlaylistSource } from '../registry'

/**
 * A Source that answers out of a fixed set rather than off a network. It is the
 * registry's second adapter, which is the point of it: with one adapter the
 * lookup is indistinguishable from a branch, and every claim about the seam
 * holding is a claim about code nothing has exercised.
 *
 * It is registered alongside Spotify rather than injected by tests, so the
 * Resolution the tests drive is the one the deployed worker would run. Its
 * addresses are `stub:playlist:<name>` -- a URI, so nothing copied from a
 * browser can reach it by accident.
 *
 * Its vocabulary is its own, the way Spotify's is Spotify's. Nothing outside
 * this directory sees a `recording` or a `set`; what leaves is a
 * NormalizedPlaylist, same as every Source.
 */

/**
 * A name for a fixed set, not an id on a service. Kept to the characters a
 * person would type, so an address that reaches this Source is one somebody
 * meant to write.
 */
const ADDRESS = /^stub:playlist:([A-Za-z0-9-]{1,64})$/

const sourceIdFrom = (input: string): string | undefined =>
  ADDRESS.exec(input.trim())?.[1]

/**
 * What this Source offers, in its own words. A recording, or an entry that is
 * something else and has no Track in it.
 */
type StubEntry =
  | {
      kind: 'recording'
      ref: string
      name: string
      by: string[]
      set: string | null
      lengthMs: number | null
      code: string | null
      art: string | null
    }
  | { kind: 'not-a-recording' }

/**
 * The fixed set, invented rather than captured. Four entries, and the third is
 * not a recording -- so `skipped` carries a count something produced, and the
 * gap it leaves at index 2 is visible in the positions that survive. A Source
 * whose every entry is a Track would leave both untested.
 *
 * The rest is chosen to reach each shape a Track can take: one artist and
 * several, an album and none, a duration and none, an ISRC and none, cover art
 * and none.
 */
const FIXED_SET: StubEntry[] = [
  {
    kind: 'recording',
    ref: 'blue-dot',
    name: 'Blue Dot',
    by: ['Aria Fenn'],
    set: 'Ninety Miles',
    lengthMs: 214_000,
    code: 'GBSTU0100001',
    art: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
  },
  {
    kind: 'recording',
    ref: 'long-way-down',
    name: 'Long Way Down',
    by: ['Aria Fenn', 'The Quiet Hour'],
    set: 'Ninety Miles',
    lengthMs: 187_500,
    code: null,
    art: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
  },
  { kind: 'not-a-recording' },
  {
    kind: 'recording',
    ref: 'salt-and-wire',
    name: 'Salt and Wire',
    by: ['Corvid Ten'],
    set: null,
    lengthMs: null,
    code: 'GBSTU0100003',
    art: null,
  },
]

export const stub: PlaylistSource<StubEntry[]> = {
  id: 'stub',

  claims: (url) => sourceIdFrom(url) !== undefined,

  parse: (url) => {
    const sourceId = sourceIdFrom(url)
    // Unreachable through the registry, which only reaches an adapter that has
    // already claimed the address. It throws for the reason Spotify's does: a
    // caller that skips `claims` should fail loudly rather than store a
    // Playlist with no id.
    if (sourceId === undefined) throw new Error('no stub playlist in this address')
    return { sourceId }
  },

  // Every address reaches the same set. What varies between stub Playlists is
  // which Playlist they are, not what is in them -- the pipeline is what is
  // under test, not the Source.
  fetch: async () => FIXED_SET,

  normalize: (entries) => {
    const playlist: NormalizedPlaylist = { tracks: [], skipped: 0 }

    entries.forEach((entry, position) => {
      if (entry.kind !== 'recording') {
        playlist.skipped += 1
        return
      }

      playlist.tracks.push({
        sourceTrackId: entry.ref,
        title: entry.name,
        artists: entry.by,
        album: entry.set,
        durationMs: entry.lengthMs,
        isrc: entry.code,
        // The Source's own index, not the index within what survived.
        position,
        coverImageUrl: entry.art,
      })
    })

    return playlist
  },
}

