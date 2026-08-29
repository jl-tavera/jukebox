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
