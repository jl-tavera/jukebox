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
 *
 * The terminal's width is handed in, so that a command whose layout depends on
 * it -- `show`'s table -- can ask at the moment it is drawn. `render`
 * already holds an `Io`, which is what makes this a parameter here rather than
 * one threaded through every command in the tree.
 *
 * **A number rather than the `Io` it comes off, and the narrowing is the point.**
 * An `Io` carries `out`, of which that file says "exactly one object is written
 * here, by the renderer, and nothing else writes here at all". Handing it to
 * every renderer would put a write handle on stdout inside the one function in
 * this program whose whole job is to compute a string and return it -- and the
 * claim that `render` is the only writer would go from structural to merely
 * observed. A width is the only thing any renderer wants and the only thing that
 * cannot be misused.
 *
 * Almost nothing reads it, and nothing had to change to gain it: a thunk taking
 * no argument satisfies a type that supplies one, so every renderer written
 * before this compiles untouched.
 */
export type Renderable<T = unknown> = {
  outcome: Outcome<T>
  human: (width: number) => string
}

export const succeeded = <T>(
  command: string,
  data: T,
  human: (width: number) => string,
): Renderable<T> => ({
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
