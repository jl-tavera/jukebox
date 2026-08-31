import { boot, type Backend } from './boot'

/**
 * What a command is handed, and everything it may find there.
 *
 * Split out of `boot.ts` at #36, which is where that file said the move would
 * cost least. Two unrelated questions had been sharing one module: where the API
 * is and whether this binary may talk to it, which is the boot sequence; and how
 * long a command waits for work it did not start, which has nothing to do with
 * booting and was only there because `Session` was.
 *
 * The direction is one way on purpose. This module reaches for the boot; the
 * boot knows nothing about a session. That is what keeps `boot.ts`'s own claim
 * true -- there is exactly one door to the network, and a command that does not
 * open it cannot fetch, cannot read the saved copy, and cannot write one.
 */

/**
 * How long a command waits for something out of its hands, and how often it asks
 * again while it waits.
 *
 * In the session because a test has to be able to shorten it and production must
 * not: an environment variable would be a knob shipped to every user so that one
 * test could reach a branch. `Seams` is where this repository already puts
 * exactly that, beside the address the discovery document is read from.
 */
export type Patience = { windowMs: number; intervalMs: number }

/**
 * Thirty seconds, asking every second.
 *
 * Every add is a cold Resolution -- nothing is read from a Source until the queue
 * gets to it -- so the wait is the normal experience rather than an edge case.
 * Long enough that a Resolution almost always lands inside it; short enough that
 * nobody concludes the terminal has frozen.
 *
 * `sync` does not wait at all, and that is not an oversight: a Playlist still
 * being read is one of the five answers it reports, and a command run on a
 * schedule has no one to keep company while it hangs on.
 */
export const PATIENCE: Patience = { windowMs: 30_000, intervalMs: 1_000 }

/** What `main` puts in citty's `data`, and the only thing a command may find there. */
export type Session = { backend: () => Promise<Backend>; patience: Patience }

/**
 * The backend, out of a context citty types as `any`.
 *
 * One call rather than two, so that obtaining the thunk and checking it cannot
 * come apart. The cast is narrowed by an actual check rather than trusted, for
 * the same reason `isRenderable` checks: `data` is whatever the caller put
 * there, and a command run without a session should say so rather than read a
 * property of `undefined`.
 *
 * This is the second reason `root.ts`'s tree stays one level deep. citty's own
 * `runCommand` does not forward `data` when it recurses into a nested
 * subcommand, so a command two levels down would be handed nothing at all --
 * silently, and only at the moment it asked.
 */
export const backend = async (data: unknown): Promise<Backend> => {
  const session = data as Session | undefined

  // Optional chaining covers every shape at once: absent, null, a primitive, or
  // an object carrying no thunk all fail the same check.
  if (typeof session?.backend !== 'function') {
    throw new Error('this command was run with no session to reach the backend through')
  }

  return await session.backend()
}

/**
 * The patience this run was given.
 *
 * Falls back to the default rather than refusing, unlike `backend`: a command
 * with no session cannot reach a backend at all, but one with no patience has a
 * perfectly good answer to how long to wait.
 */
export const patienceOf = (data: unknown): Patience =>
  (data as Session | undefined)?.patience ?? PATIENCE

/**
 * Booted at most once per run, and only if something asks.
 *
 * The promise is what is kept rather than the value, so two callers in one run
 * share one fetch and a boot that stopped stays stopped. A second attempt after
 * a gate refused would either refuse again, wasting a round trip, or -- worse --
 * get a different answer from a document that moved underneath it.
 */
export const lazily = (url: string, warn: (text: string) => void): (() => Promise<Backend>) => {
  let running: Promise<Backend> | undefined
  return () => (running ??= boot(url, warn))
}
