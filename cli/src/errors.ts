import type { ErrorCode } from '@jukebox/schema'

/**
 * Codes the CLI raises on its own behalf, where the API's four say what the
 * server could not do.
 *
 * Five now. The version gate and the network are two of the three this file
 * used to name as absent, and #33 built the boot that raises them; a third
 * arrived with them, because a backend reporting itself down is neither a usage
 * problem nor a bug here, and a caller branching on it needs a word for it.
 *
 * No command registered today reaches that boot -- #35's `add` is the first
 * that will. The rule this file set down is about a code *nothing raises*, and
 * the code raising these three ships in the same commit and is exercised at the
 * same seam `cli.test.ts` already reaches for a command tree of its own. A
 * Mirror that would not open is still absent, and stays absent, because #35 is
 * where a Mirror comes into existence.
 */
export type ClientErrorCode =
  /** The argument vector names no command, or one that does not exist. */
  | 'invalid_usage'
  /** Something failed that nothing planned for. Always a bug here. */
  | 'unexpected'
  /**
   * This binary predates the oldest one the backend will serve. A hard stop and
   * never a warning: a client that predates a breaking contract change cannot
   * proceed safely, and a result it half-understood is worse than no result.
   */
  | 'version_unsupported'
  /**
   * The backend says it is not serving. The document's `message` is printed
   * verbatim beside this, which is what lets the copy improve without a client
   * release.
   *
   * Named for the word the document's own `status` uses rather than after the
   * API's `source_unavailable`, which is about a Playlist's Source and not
   * about us. Two codes a word apart is a branch waiting to be got wrong.
   */
  | 'service_down'
  /**
   * The discovery document could not be read and there was no saved copy to
   * fall back on. Raised only when both are true -- a fetch that failed with a
   * saved copy behind it is a warning and a working run.
   */
  | 'network_unreachable'

/**
 * One vocabulary, in one place.
 *
 * The API's half is imported rather than restated, which is the coupling this
 * repo wants: a code added to `openapi.yaml` widens what the CLI can branch on
 * without anyone remembering to copy it, and a code renamed there breaks this
 * typecheck until it is handled.
 */
export type JukeboxErrorCode = ErrorCode | ClientErrorCode
