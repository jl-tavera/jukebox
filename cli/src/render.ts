import type { Io } from './io'
import type { Mode } from './mode'
import type { Failure, Outcome, Renderable } from './outcome'

/**
 * The object a caller in JSON mode reads. Exactly one of these is written per
 * run, on stdout, with nothing else beside it.
 *
 * `version` is stamped on here rather than carried by the outcome, because it
 * is a property of the binary that answered and not of the answer -- and
 * because a caller reading a shape that is still moving needs to know which
 * binary shaped it. Its stability is docs/adr/0005.
 *
 * That name collides with `CONTEXT.md`'s **Version**, which is a Playlist's own
 * counter, and the collision is real rather than theoretical: when Sync lands,
 * `data` will carry one of those beside this one. Spec #29 fixes this
 * envelope's spelling, so it is written down here rather than quietly renamed.
 * ADR-0005 is what leaves room to settle it -- the shape is free to move until
 * 1.0, and this is the kind of thing to settle before it cannot.
 */
export type Envelope =
  | { ok: true; command: string; version: string; data: unknown }
  | { ok: false; command: string; version: string; error: Failure }

const envelope = (outcome: Outcome, version: string): Envelope =>
  outcome.ok
    ? { ok: true, command: outcome.command, version, data: outcome.data }
    : { ok: false, command: outcome.command, version, error: outcome.error }

/**
 * The one place a result is written, and the whole of the stream discipline.
 *
 * This said "the one place anything is written" until #54, and the menu is the
 * qualifier: a launcher has to draw a wordmark and a prompt before there is any
 * result to render, so something else does now write. What it writes is chrome
 * and all of it goes to stderr, which is why the claim worth making survives
 * word for word -- nothing but this function writes to stdout, and a menu
 * session that produced no result writes nothing there at all.
 *
 * **stdout is the guarantee, and the only one.** In JSON mode it gets exactly
 * one object, so a caller can read it whole and parse it. In human mode what
 * worked goes there and what did not goes to stderr, so a person sees the
 * problem and a pipe reading stdout is never handed prose where it expected
 * data.
 *
 * Warnings go to stderr in *both* renderings, which is what `Io.err` has always
 * said it was for -- "everything that is not data". Nothing parsing JSON reads
 * stderr, so this costs the guarantee above nothing; suppressing them in JSON
 * mode would instead leave the caller most likely to act on a stale API address
 * as the only one never told about it.
 *
 * They are written before the result rather than after, because that is the
 * order they happened in: the fallback is why the answer below reads as it does.
 */
export const render = (
  renderable: Renderable,
  mode: Mode,
  version: string,
  io: Io,
  warnings: string[],
): void => {
  for (const warning of warnings) io.err(warning + '\n')

  if (mode === 'json') {
    io.out(JSON.stringify(envelope(renderable.outcome, version)) + '\n')
    return
  }

  const text = renderable.human()
  if (text === '') return

  if (renderable.outcome.ok) io.out(text + '\n')
  else io.err(text + '\n')
}
