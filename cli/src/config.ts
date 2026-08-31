import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultLibrary, given, locations, thisHost, type Host } from './paths'

/**
 * The two settings, where each one's value came from, and anything written down
 * that had to be ignored.
 *
 * **Nothing acts on either setting in this release, and that is the whole shape
 * of this module.** There is no scheduler and no Fetching, so this reads and
 * reports and never writes: no file is created, no directory is created, and
 * least of all a Library folder. A user who sets a path and finds an empty
 * folder was misled; a user who is told plainly that nothing has arrived yet was
 * not. `NOTE` is where that is said, in both renderings.
 *
 * TOML rather than JSON, per spec #29. `Bun.TOML.parse` is built into the
 * runtime, so it costs no dependency and nothing that would reintroduce a
 * native module to the compiled binary. It also spells a Windows path without
 * escaping it, which JSON cannot: `library_path = 'C:\Users\ada\Music\Jukebox'`.
 */

/** The file's name inside the configuration directory. Named by a test, so exported. */
export const CONFIG_FILE = 'config.toml'

/** One variable each, and each moves exactly one setting. */
export const LIBRARY_VARIABLE = 'JUKEBOX_LIBRARY'
export const INTERVAL_VARIABLE = 'JUKEBOX_SYNC_INTERVAL_HOURS'

/**
 * A day, and it is a statement of intent rather than a measurement.
 *
 * `DESIGN.md` refuses to invent constants "anywhere a concrete number would need
 * real measurement", and names refresh intervals among them -- but that is about
 * the server's own refresh policy, which §11 still lists as open. This is a
 * person saying how often they mean to run `sync`, and daily is the gentlest
 * rhythm that is still a rhythm. Nothing reads it, so nothing is riding on it.
 */
export const DEFAULT_INTERVAL_HOURS = 24

/**
 * Said outright rather than left to careful wording.
 *
 * Silence would satisfy the letter of "must not imply anything acts on the sync
 * interval", and would not satisfy a reader: somebody who sees `24` next to the
 * word interval concludes that something happens daily, and they are wrong. It
 * covers the Library path for the same reason -- ADR-0004's layout is decided,
 * and this release still puts no file in it.
 */
export const NOTE =
  'Nothing acts on these yet. This release records them: no Library folder is created, ' +
  'nothing is downloaded, and nothing runs on a schedule.'

/** Which of the three places a value actually came from. */
export type Origin = 'default' | 'file' | 'environment'

export type Setting<T> = { value: T; origin: Origin }

/**
 * What the configuration file turned out to be.
 *
 * Three states rather than two, because "there is no file" and "there is a file
 * and it is broken" call for opposite treatment and are trivially confused. The
 * first is every first run. The second is somebody's work not taking effect.
 */
export type FileState =
  | { kind: 'absent' }
  | { kind: 'read'; values: Record<string, unknown> }
  | { kind: 'unreadable'; because: string }

export type Settings = {
  library_path: Setting<string>
  sync_interval_hours: Setting<number>
}

export type Resolved = {
  settings: Settings
  /**
   * Anything written down that was ignored, one sentence each. Empty is the
   * ordinary case.
   *
   * Carried as data rather than raised as a warning on stderr, and the
   * difference matters for exactly one reader. `render` sends warnings to stderr
   * in both modes and notes that nothing parsing JSON reads stderr -- so a
   * warning would hide a broken file from the caller least able to notice it any
   * other way. A broken file is also not an aside here: it is the answer to the
   * question `config` was asked.
   */
  problems: string[]
}

export type Configured = Resolved & {
  /**
   * Where the file would be, and which of the three things it turned out to be.
   *
   * The state rather than a `present` flag, because "there is one and it could
   * not be read" is neither of the answers a boolean offers, and an earlier
   * version of this printed `Read from ...` above a problem saying it had not
   * been read. That is the exact failure this ticket is about.
   */
  file: { path: string; state: FileState['kind'] }
  /** The sentence the human rendering ends with, carried for the reader who parses. */
  note: string
}

/**
 * The only keys this release understands.
 *
 * `satisfies` rather than a bare array, and it is the whole reason this is not
 * simply a list. The names have to match `Settings`' own, and a hand-kept
 * duplicate of a type's keys is exactly the thing that goes stale in silence:
 * renaming a setting would otherwise leave the old name accepted, the new name
 * reported as unknown, and nothing failing to say so. This makes that a
 * typecheck error.
 */
const KNOWN = ['library_path', 'sync_interval_hours'] as const satisfies
  readonly (keyof Settings)[]

/**
 * The whole of the resolution, and pure.
 *
 * Handed a Host and the file's state rather than reading either, for the reason
 * `locations` is handed one: Windows is this project's primary environment and
 * Linux is CI's, and a resolver that read `process` directly would let each
 * check only its own answer.
 */
export const resolved = (host: Host, state: FileState): Resolved => {
  const problems: string[] = []
  const written = readable(state, problems)

  return {
    settings: {
      library_path: settle(
        [
          { origin: 'environment', raw: given(host.env, LIBRARY_VARIABLE) },
          { origin: 'file', raw: written['library_path'] },
        ],
        asPath,
        (origin) => `${subject(origin, 'library_path', LIBRARY_VARIABLE)} is not a path`,
        defaultLibrary(host),
        problems,
      ),
      sync_interval_hours: settle(
        [
          { origin: 'environment', raw: given(host.env, INTERVAL_VARIABLE) },
          { origin: 'file', raw: written['sync_interval_hours'] },
        ],
        asHours,
        (origin) =>
          `${subject(origin, 'sync_interval_hours', INTERVAL_VARIABLE)} is not a whole ` +
          'number of hours above zero',
        DEFAULT_INTERVAL_HOURS,
        problems,
      ),
    },
    problems,
  }
}

/**
 * The first candidate that is usable, in precedence order, and a problem for
 * every one before it that was set to something unusable.
 *
 * Falling through rather than dropping to the default is the point. Somebody who
 * mistyped an environment variable still meant what their file says, and
 * throwing that away too would compound one mistake into two.
 */
const settle = <T>(
  candidates: { origin: Origin; raw: unknown }[],
  usable: (raw: unknown) => T | undefined,
  complain: (origin: Origin) => string,
  fallback: T,
  problems: string[],
): Setting<T> => {
  for (const { origin, raw } of candidates) {
    if (raw === undefined) continue

    const value = usable(raw)
    if (value !== undefined) return { value, origin }

    // "Ignored" rather than "the default is being used", and the difference is
    // not pedantry. This falls through, so what actually wins may be the file
    // rather than the default -- and an earlier version said `the default is
    // being used instead` above a table reading `6 (file)`. Naming only what was
    // discarded is true in every case; the table above says what replaced it.
    problems.push(`${complain(origin)}, so it was ignored.`)
  }

  return { value: fallback, origin: 'default' }
}

const subject = (origin: Origin, key: string, variable: string): string =>
  origin === 'environment' ? `\`${variable}\`` : `\`${key}\` in the configuration file`

/**
 * Trimmed, because both sources reach here through something that adds
 * whitespace by accident -- a shell variable and a hand-edited file -- and
 * because Windows strips a trailing space from a directory name anyway, which
 * would leave the stored path and the disk disagreeing.
 */
const asPath = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined

  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * A whole number of hours above zero, from a file that gives a number or a
 * variable that gives a string.
 *
 * `Number.isInteger` is doing more work than it looks: it rejects `NaN` and both
 * infinities as well as a fraction. TOML has `inf` and `nan` of its own and
 * `Bun.TOML.parse` hands them over as `null`, so those arrive as the wrong type
 * and are refused a step earlier.
 */
const asHours = (raw: unknown): number | undefined => {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined

  return value
}

/**
 * What the file had to say, and a problem if it had nothing legible to say.
 *
 * An unreadable file still yields an empty set rather than stopping the command,
 * so the environment and the defaults still resolve and `config` still answers.
 */
const readable = (state: FileState, problems: string[]): Record<string, unknown> => {
  if (state.kind === 'absent') return {}

  if (state.kind === 'unreadable') {
    problems.push(
      `The configuration file could not be read: ${state.because}. None of it was used.`,
    )
    return {}
  }

  // A key nobody recognises is almost always a typo, and a typo here is silent
  // by nature: the setting stays at its default and the file looks fine. Saying
  // so costs one sentence and is the only way somebody who wrote `libary_path`
  // ever finds out.
  for (const key of Object.keys(state.values)) {
    if (!KNOWN.some((known) => known === key)) {
      problems.push(`Jukebox does not know a setting called \`${key}\`, so it was ignored.`)
    }
  }

  return state.values
}

/**
 * Everything above, against the real filesystem.
 *
 * `locations` is read through on every call rather than captured, for the reason
 * `mirror.ts` gives: the tests relocate a whole home between runs, and a
 * captured path would be the previous one's.
 */
export const configuration = (host: Host = thisHost()): Configured => {
  const path = join(locations(host).config, CONFIG_FILE)
  const state = read(path)

  return { file: { path, state: state.kind }, ...resolved(host, state), note: NOTE }
}

const read = (path: string): FileState => {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    // No file is the ordinary case, and there is deliberately no prompt to make
    // it stop being one. Anything else -- a file this user may not read, a
    // parent that is not a directory -- is a real problem worth a sentence,
    // because silently defaulting is how somebody's settings stop applying with
    // nothing said.
    const code = (error as { code?: unknown }).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'absent' }

    return { kind: 'unreadable', because: because(error) }
  }

  try {
    const values: unknown = Bun.TOML.parse(text)

    // A TOML document is a table, so this is close to unreachable -- and it is
    // checked rather than asserted because the alternative is reading properties
    // off whatever it turned out to be.
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      return { kind: 'unreadable', because: 'it is not a table of settings' }
    }

    return { kind: 'read', values: values as Record<string, unknown> }
  } catch (error) {
    return { kind: 'unreadable', because: because(error) }
  }
}

const because = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
