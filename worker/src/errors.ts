import type { ErrorCode, ErrorEnvelope } from '@jukebox/schema'

/**
 * The one place an error response body is built. Typed from the OpenAPI
 * document, so widening or renaming a code there breaks every call site here
 * until it is handled.
 *
 * `message` is written for a human and printed verbatim by the CLI; `code` is
 * what the CLI branches on.
 */
export const errorBody = (code: ErrorCode, message: string): ErrorEnvelope => ({
  error: { code, message },
})
