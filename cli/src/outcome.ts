import type { JukeboxErrorCode } from './errors'

/** A code to branch on, and a sentence written for a person to read. */
export type Failure = {
  code: JukeboxErrorCode
  message: string
}

/**
 * What a command computes: one object, either way it went.
 *
 * The whole design rests on this being computed and then rendered, rather than
 * printed as the command goes. A command that printed could not be given
 * machine output later without being rewritten, which is why this exists before
 * any command that needs it does.
 */
export type Outcome<T = unknown> =
  | { ok: true; command: string; data: T }
  | { ok: false; command: string; error: Failure }

/**
 * An outcome and the human text for it, which is the pair every command hands
 * back. `human` is a thunk over what the command already computed, so the two
 * renderings read the same values and cannot describe different things.
 */
export type Renderable<T = unknown> = {
  outcome: Outcome<T>
  human: () => string
}

export const succeeded = <T>(command: string, data: T, human: () => string): Renderable<T> => ({
  outcome: { ok: true, command, data },
  human,
})

/**
 * A failure says the same thing in both renderings, so there is nothing for a
 * command to write twice. Where the message came from a server it is printed
 * verbatim, which is what lets the copy improve without a client release.
 */
export const failed = (
  command: string,
  code: JukeboxErrorCode,
  message: string,
): Renderable<never> => ({
  outcome: { ok: false, command, error: { code, message } },
  human: () => message,
})
