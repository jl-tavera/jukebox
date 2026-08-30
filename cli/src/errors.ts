import type { ErrorCode } from '@jukebox/schema'

/**
 * Codes the CLI raises on its own behalf, where the API's four say what the
 * server could not do.
 *
 * Two, because two is what this release can actually reach. A version gate that
 * refused, a Mirror that would not open and a network that could not be reached
 * all belong here and none exists yet -- the same rule the worker's migrations
 * set down for columns applies to a vocabulary: a code nothing raises is a
 * promise to a caller that nothing keeps.
 */
export type ClientErrorCode =
  /** The argument vector names no command, or one that does not exist. */
  | 'invalid_usage'
  /** Something failed that nothing planned for. Always a bug here. */
  | 'unexpected'

/**
 * One vocabulary, in one place.
 *
 * The API's half is imported rather than restated, which is the coupling this
 * repo wants: a code added to `openapi.yaml` widens what the CLI can branch on
 * without anyone remembering to copy it, and a code renamed there breaks this
 * typecheck until it is handled.
 */
export type JukeboxErrorCode = ErrorCode | ClientErrorCode
