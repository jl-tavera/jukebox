import type { PlaylistId } from '@jukebox/schema'
import { spotify } from './spotify'

/** Every Source Jukebox mirrors from. Apple Music and YouTube are not written yet. */
export type SourceName = 'spotify' | 'apple' | 'youtube'

/**
 * The lookup every route and consumer goes through to reach a Source. Nothing
 * outside this directory imports an adapter directly -- that is what keeps
 * Apple Music and YouTube additive rather than an audit of every call site.
 */
export interface PlaylistSource {
  readonly id: SourceName

  /** Does this adapter own this URL? Cheap, no network. */
  claims(url: string): boolean

  /** URL -> stable Source-local id. Throws on malformed input. */
  parse(url: string): { sourceId: string }
}

const sources: PlaylistSource[] = [spotify]

export const findSource = (url: string): PlaylistSource | undefined =>
  sources.find((source) => source.claims(url))

/**
 * ADR-0001's identifier, built in one place rather than as a template literal
 * at each call site. Deterministic, so adding a Playlist twice is idempotent
 * with no lookup, and readable, so a log line says which Playlist it concerns.
 */
export const playlistId = (source: SourceName, sourceId: string): PlaylistId =>
  `${source}:${sourceId}`
