import type { components } from './generated'

/**
 * Named aliases over the generated document. Consumers import these rather than
 * reaching into `components['schemas'][...]`, so the indexing lives in one place
 * and a rename in openapi.yaml surfaces here rather than at every call site.
 */

/** The shared error envelope, used by every error response on every endpoint. */
export type ErrorEnvelope = components['schemas']['Error']

/** Stable and machine-readable. What the CLI branches on. */
export type ErrorCode = components['schemas']['ErrorCode']

export type CreatePlaylistRequest = components['schemas']['CreatePlaylistRequest']

export type CreatePlaylistResponse = components['schemas']['CreatePlaylistResponse']

/** The poll response: the Playlist is tracked, but has no Tracks yet. */
export type PendingTracks = components['schemas']['PendingTracks']

/** A Playlist's Tracks at one Version. Also the shape of the stored snapshot. */
export type PlaylistTracks = components['schemas']['PlaylistTracks']

/** An entry in a Playlist as its Source describes it. Metadata, never a file. */
export type Track = components['schemas']['Track']

/** Source name and the Source's own id, joined by a colon. See ADR-0001. */
export type PlaylistId = components['schemas']['PlaylistId']

/** Where a Playlist is in its lifecycle: `CONTEXT.md`'s Pending / Unreachable / Gone. */
export type PlaylistStatus = components['schemas']['PlaylistStatus']

/**
 * The document the site publishes and the CLI reads on boot. Not an API path --
 * the site serves it and the worker does not -- so it is declared by hand
 * rather than generated. See `./discovery`.
 */
export type { DiscoveryDocument, DiscoveryStatus } from './discovery'

/** The publish-time check on that document. Strict on purpose; see `./discovery`. */
export { discoveryProblems } from './discovery'
