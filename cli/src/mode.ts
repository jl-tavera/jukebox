import type { Io } from './io'

/** Human text, or exactly one JSON object. Every command renders both ways. */
export type Mode = 'human' | 'json'

/**
 * Asked for, or implied by where the output is going.
 *
 * The implication matters as much as the flag: a pipe, a redirect or a CI job
 * is something parsing the output rather than someone reading it, and a CLI
 * that waited to be asked would make every script carry the flag.
 *
 * Same rule as cligentic's `detect` block, minus its escape hatch for forcing
 * human output into a pipe. Nothing has needed one, and the way to add it is a
 * third answer here rather than anywhere else -- `main` reads the flag off the
 * raw vector, so citty's `--no-` form for a declared boolean never reaches it.
 */
export const selectMode = (json: boolean, io: Io): Mode =>
  json || !io.stdoutIsTty ? 'json' : 'human'

/**
 * Whether anything may ask a question.
 *
 * This said that nothing in the release prompted, and that it was therefore the
 * guarantee rather than its enforcement -- true while it was written, and the
 * reason it was written. #54 is where it stops being true: a bare `jukebox`
 * opens a menu on this predicate and on nothing else, so the guarantee is now
 * enforced at the one place that could break it.
 *
 * What it means has not moved. It is still the one predicate a prompt must
 * pass, and it is still false whenever the output is being parsed or nobody is
 * at the keyboard. In either case a missing answer has to be an error, never a
 * wait -- a command that hangs in a cron entry is worse than one that fails in
 * it, and that is exactly what a menu drawn into a pipe would be.
 */
export const promptsAllowed = (mode: Mode, io: Io): boolean =>
  mode === 'human' && io.stdinIsTty
