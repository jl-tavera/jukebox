import type { PlaylistId, Track } from '@jukebox/schema'
import { spotify } from './spotify'
import { stub } from './stub'

/**
 * Every Source Jukebox mirrors from. Apple Music and YouTube are not written
 * yet. `stub` answers out of a fixed set rather than off a network -- see
 * `stub/index.ts` for why it is registered rather than injected.
 */
export type SourceName = 'spotify' | 'apple' | 'youtube' | 'stub'

/**
 * A Track as everything downstream of a Source sees it. It is the generated
 * contract type rather than a second declaration of the same fields: the API
 * serves the normalized Track unchanged, so two copies of the shape could only
 * ever drift apart, and changing `schema/openapi.yaml` should break every
 * adapter's typecheck -- which is the point of generating from one document.
 */
export type NormalizedTrack = Track

/**
 * What `normalize` answers with. Everything downstream of it sees only this;
 * a Source's own vocabulary reaches no further.
 *
 * `title`, `owner` and the Source's own revision token are not here. Nothing
 * displays them and nothing re-resolves yet, and the interface grows a member
 * at a time rather than being stubbed ahead of its first use.
 */
export interface NormalizedPlaylist {
  tracks: NormalizedTrack[]

  /**
   * How many entries the Source offered that are not Tracks. Counted rather
   * than dropped silently, so a shorter list than the Source shows does not
   * read as data loss.
   */
  skipped: number
}

/**
 * The lookup every route and consumer goes through to reach a Source. Nothing
 * outside this directory imports an adapter directly -- that is what keeps
 * Apple Music and YouTube additive rather than an audit of every call site.
 *
 * `Raw` is the adapter's own shape. It buys the adapter one thing -- its
 * `fetch` and its `normalize` are checked against each other -- and it is not
 * what keeps a Source's vocabulary inside its directory: the registry erases
 * `Raw` to `unknown`, and TypeScript's method bivariance would let any
 * adapter's shape through. That boundary is convention here, as DESIGN
 * section 03 says and section 11 leaves open.
 */
export interface PlaylistSource<Raw = unknown> {
  readonly id: SourceName

  /** Does this adapter own this URL? Cheap, no network. */
  claims(url: string): boolean

  /** URL -> stable Source-local id. Throws on malformed input. */
  parse(url: string): { sourceId: string }

  /** The one expensive call. Only ever reached from the Resolution consumer. */
  fetch(sourceId: string, env: Env): Promise<Raw>

  /** Source-shaped -> domain-shaped. Pure and synchronous. */
  normalize(raw: Raw): NormalizedPlaylist
}

const sources: PlaylistSource[] = [spotify, stub]

export const findSource = (url: string): PlaylistSource | undefined =>
  sources.find((source) => source.claims(url))

/**
 * The same lookup from the other end. A Resolution starts from a stored Source
 * name rather than from an address, because D1 is what says which Playlists
 * are tracked -- the queue message carries no copy of it to disagree with.
 */
export const sourceNamed = (name: SourceName): PlaylistSource | undefined =>
  sources.find((source) => source.id === name)

/**
 * ADR-0001's identifier, built in one place rather than as a template literal
 * at each call site. Deterministic, so adding a Playlist twice is idempotent
 * with no lookup, and readable, so a log line says which Playlist it concerns.
 * Tracks follow the same scheme, which is why the construction is shared.
 */
const namespaced = (source: SourceName, sourceId: string) => `${source}:${sourceId}`

export const playlistId = (source: SourceName, sourceId: string): PlaylistId =>
  namespaced(source, sourceId)

export const trackId = (source: SourceName, sourceTrackId: string): string =>
  namespaced(source, sourceTrackId)
