import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replaceFile } from './files'
import { defaultLibrary, given, locations, thisHost, type Host } from './paths'

/**
 * The two settings, where each one's value came from, and anything written down
 * that had to be ignored.
 *
 * **Nothing acts on either setting, and that is still the shape of this module.**
 * There is no scheduler and no Fetching, so nothing here creates a Library folder
 * or puts anything in one, and `NOTE` says so under every answer the command
 * gives -- including the ones that wrote something. A user who sets a path and
 * finds an empty folder was misled; a user told plainly that nothing has arrived
 * yet was not.
 *
 * Since #53 it also writes, one named setting at a time. The only things a write
 * brings into existence are the configuration directory and the file: a folder of
 * the user's own decisions, not a folder of files that cannot arrive yet.
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
 *
 * The read variant carries the text as well as the values, which the resolver has
 * no use for and the writer cannot do without: a rewrite drops every comment in
 * the file, and the only way to know whether that costs the user anything is to
 * have seen the lines.
 */
export type FileState =
  | { kind: 'absent' }
  | { kind: 'read'; text: string; values: Record<string, unknown> }
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
 *
 * Exported since #53, because the command has to name them back to somebody who
 * misspelled one, and a hand-written second list is the thing above.
 */
export const KNOWN = ['library_path', 'sync_interval_hours'] as const satisfies
  readonly (keyof Settings)[]

export type SettingKey = (typeof KNOWN)[number]

export const isKnown = (key: string): key is SettingKey =>
  KNOWN.some((known) => known === key)

/**
 * The variable that moves each setting, and how a complaint about it ends.
 *
 * One table, because these two strings are now read from three places -- the
 * resolver's problems, the command's refusal of a value typed at a shell, and
 * the sentence naming a variable that still wins. Three copies of "a whole number
 * of hours above zero" is three chances to tell one user two different rules for
 * one setting.
 */
const RULE: Record<SettingKey, { variable: string; expected: string }> = {
  library_path: { variable: LIBRARY_VARIABLE, expected: 'a path' },
  sync_interval_hours: {
    variable: INTERVAL_VARIABLE,
    expected: 'a whole number of hours above zero',
  },
}

/** The one sentence about a key nobody recognises, so its two callers agree. */
export const unknownSetting = (key: string): string =>
  `Jukebox does not know a setting called \`${key}\``

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

  const candidates = (key: SettingKey) => [
    { origin: 'environment' as const, raw: given(host.env, RULE[key].variable) },
    { origin: 'file' as const, raw: written[key] },
  ]

  const complain = (key: SettingKey) => (origin: Origin) =>
    `${subject(origin, key)} is not ${RULE[key].expected}`

  return {
    settings: {
      library_path: settle(
        candidates('library_path'),
        asPath,
        complain('library_path'),
        defaultLibrary(host),
        problems,
      ),
      sync_interval_hours: settle(
        candidates('sync_interval_hours'),
        asHours,
        complain('sync_interval_hours'),
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

const subject = (origin: Origin, key: SettingKey): string =>
  origin === 'environment' ? `\`${RULE[key].variable}\`` : `\`${key}\` in the configuration file`

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
    if (!isKnown(key)) problems.push(`${unknownSetting(key)}, so it was ignored.`)
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
  const path = configFile(host)
  const state = read(path)

  return { file: { path, state: state.kind }, ...resolved(host, state), note: NOTE }
}

const configFile = (host: Host): string => join(locations(host).config, CONFIG_FILE)

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

    return { kind: 'read', text, values: values as Record<string, unknown> }
  } catch (error) {
    return { kind: 'unreadable', because: because(error) }
  }
}

const because = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Writing, which is the half of this module #53 added.
 *
 * Everything below is stricter than everything above, and deliberately so. The
 * resolver has to cope with any file a human wrote, so it forgives what it can
 * and reports what it cannot. The writer only has to cope with what it is willing
 * to put in a file, so it refuses anything it cannot spell back exactly. A value
 * the writer accepted and the resolver then ignored would be the worst outcome
 * available: `config <key> <value>` reporting success, and the very next `config`
 * reporting a problem about what it wrote.
 */

/**
 * Nothing a TOML string can hold.
 *
 * A literal string forbids control characters outright, and a basic string wants
 * them escaped -- which `JSON.stringify` does not do for `U+007F`, so the
 * fallback below cannot be trusted with one. Refusing them here is a rule about
 * what may be written, and it costs a user nothing: no path and no interval has
 * one in it on purpose.
 */
const CONTROL = /[\u0000-\u001f\u007f]/

/** A value the file may hold for this key, or the clause saying why it may not. */
export type Understood = { ok: true; value: string | number } | { ok: false; because: string }

/**
 * A value typed at a shell, judged exactly as the file's own copy would be.
 *
 * Built on `asPath` and `asHours` rather than beside them, which is the drift
 * this exists to prevent: those two decide whether a written value takes effect,
 * so anything they would ignore has to be refused before it reaches the file
 * rather than reported after it is in there.
 */
export const understood = (key: SettingKey, typed: string): Understood => {
  const refused = { ok: false as const, because: `it is not ${RULE[key].expected}` }

  if (key === 'library_path') {
    const value = asPath(typed)
    if (value === undefined) return refused
    if (CONTROL.test(value)) {
      return { ok: false, because: 'it has a control character in it, which TOML cannot hold' }
    }

    return { ok: true, value }
  }

  const value = asHours(typed)
  if (value === undefined) return refused

  // `Number.isInteger` above is happy with `1e21`, whose `String()` is `1e+21` --
  // which TOML reads back as a float. A setting that changed type on its way
  // through the file is a thing nobody would ever think to look for. The resolver
  // keeps the looser rule because a file may legitimately hold one; the writer
  // will not create one.
  if (!Number.isSafeInteger(value)) {
    return { ok: false, because: 'it is too large to record exactly' }
  }

  return { ok: true, value }
}

/**
 * One value as the file spells it, or nothing where the file cannot spell it.
 *
 * A literal string wherever possible, because that is the reason the file is TOML
 * at all: `'C:\Users\ada\Music\Jukebox'` needs no escaping and reads back the way
 * it was typed. A basic string only where a literal is impossible, which is a
 * value holding the quote that would end it.
 *
 * Handed `unknown` rather than a value type, because it is used on what the
 * existing file held as well as on what is being set, and a file can hold an
 * array, a date, or a table. Anything it cannot spell is dropped, and said.
 */
const spelled = (value: unknown): string | undefined => {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : undefined
  if (typeof value !== 'string' || CONTROL.test(value)) return undefined

  return value.includes("'") ? JSON.stringify(value) : `'${value}'`
}

/** Any line that assigns something, which is the only kind a rewrite reproduces. */
const ASSIGNMENT = /^\s*[A-Za-z0-9_-]+\s*=/

/**
 * Whether the file holds anything a rewrite would lose.
 *
 * A rewrite reproduces the settings and nothing else, so a comment goes. Rather
 * than say so every time -- which would train the reader to skip it -- this asks
 * whether there is anything to lose. A file Jukebox wrote itself has nothing, so
 * the second and every later write is silent.
 *
 * A regular expression rather than a parser, and it is wrong in the safe
 * direction: a quoted key or a multi-line value reads as something to lose and
 * earns a warning about a comment that is not there. TOML offers no cheap way to
 * ask this, and being told about a loss that did not happen is a far smaller
 * failure than the reverse.
 */
const annotated = (text: string): boolean =>
  text.split('\n').some((line) => line.trim() !== '' && !ASSIGNMENT.test(line))

/** What a write would do, decided before anything is written. */
export type Plan =
  | {
      ok: true
      /** The whole file, ready to be written. */
      text: string
      /** The line the file now carries for this key, and the syntax to hand-write. */
      line: string
      /** What the setting resolves to now -- not what was written, when a variable wins. */
      effective: Setting<string> | Setting<number>
      warnings: string[]
      problems: string[]
    }
  | { ok: false; why: 'unreadable' | 'unspellable'; because: string }

/**
 * Everything a write decides, and pure.
 *
 * Pure for the reason `resolved` is: a Windows answer has to be checkable from
 * Linux CI, and every awkward file -- one that will not parse, one holding a
 * value nothing can spell -- is reachable here without writing one.
 */
export const planned = (
  host: Host,
  state: FileState,
  key: SettingKey,
  value: string | number,
): Plan => {
  // A file nobody can read is the one case a rewrite is not allowed to fix.
  // Every other refusal here is about one value; this one is about the whole
  // file, whose contents are opaque -- so replacing it is unbounded destruction
  // of something hand-written, rather than the bounded loss of the comments a
  // readable file holds.
  if (state.kind === 'unreadable') return { ok: false, why: 'unreadable', because: state.because }

  const held = state.kind === 'read' ? state.values : {}
  const warnings: string[] = []

  // Read before the write so a move can be noticed, and read through the resolver
  // rather than off the file, so that setting a Library path for the first time
  // is still a move away from the platform default.
  const before = resolved(host, state).settings[key].value

  // Only what the file already holds, plus the one being set. Never a default:
  // that would turn a default into a file value the user never chose, and the
  // defaults are machine-dependent -- writing this machine's `%APPDATA%` answer
  // into the file makes the file wrong on the next machine.
  const merged: Record<string, unknown> = {}
  for (const known of KNOWN) if (known in held) merged[known] = held[known]
  merged[key] = value

  const lines: { key: SettingKey; text: string }[] = []
  for (const known of KNOWN) {
    if (!(known in merged)) continue

    const spell = spelled(merged[known])
    if (spell === undefined) {
      // The one being set is a refusal rather than a warning. `understood` will
      // not hand over anything unspellable, so this is unreachable through the
      // command -- but this function is exported and pure, and dropping the very
      // key it was asked to write would leave it reporting a success that did not
      // happen.
      if (known === key) {
        return { ok: false, why: 'unspellable', because: `\`${key}\` cannot be written down` }
      }

      // Anything else is carried forward on spellability rather than on validity,
      // deliberately. `library_path = 42` is kept, because it is what the user
      // wrote and deleting it would silently "fix" their file;
      // `sync_interval_hours = nan` arrives as `null` and cannot be written at all.
      warnings.push(`\`${known}\` held something Jukebox cannot write down, so it is gone.`)
      delete merged[known]
      continue
    }

    lines.push({ key: known, text: `${known} = ${spell}` })
  }

  const text = lines.map((line) => line.text).join('\n') + '\n'

  // The writer's postcondition, checked rather than assumed. The serialiser is
  // hand-rolled and the file is the interface between it and the reader in this
  // same module; this is what stops the two drifting, and the cost of not having
  // it is a configuration file that no longer says what the user set.
  let parsed: Record<string, unknown>
  try {
    parsed = Bun.TOML.parse(text) as Record<string, unknown>
  } catch (error) {
    return { ok: false, why: 'unspellable', because: because(error) }
  }

  for (const line of lines) {
    if (parsed[line.key] !== merged[line.key]) {
      return {
        ok: false,
        why: 'unspellable',
        because: `\`${line.key}\` would not have read back as it was written`,
      }
    }
  }

  const after = resolved(host, { kind: 'read', text, values: parsed })
  const settled = after.settings[key]

  // The write worked and changed nothing anybody can see. Said out loud, or it
  // reads as a silent failure -- which is what the precedence order guarantees
  // for anybody who exported a variable months ago and forgot.
  if (settled.origin === 'environment') {
    warnings.push(
      `\`${RULE[key].variable}\` is set, and the environment wins over the file. Jukebox ` +
        `will keep using ${settled.value} until you unset it; what you just wrote is in the ` +
        'file and waiting.',
    )
  }

  // Only where the resolved value actually moves, which is what makes this and
  // the warning above mutually exclusive: a shadowed write moves nothing.
  if (key === 'library_path' && settled.value !== before) {
    warnings.push(
      `Anything already downloaded into ${before} stays there. Jukebox never moves your ` +
        'files, and it will not look in the old folder again.',
    )
  }

  for (const known of Object.keys(held)) {
    if (!isKnown(known)) {
      warnings.push(`${unknownSetting(known)}, so it is not in the file any more.`)
    }
  }

  if (state.kind === 'read' && annotated(state.text)) {
    warnings.push(
      'The file was rewritten from the settings Jukebox understands, so any comments it ' +
        'held are gone.',
    )
  }

  // Always found: the key being set is put into `merged` above, and the one way
  // it could have failed to produce a line is the refusal at the top of the loop.
  const line = lines.find((written) => written.key === key)!.text

  return { ok: true, text, line, effective: settled, warnings, problems: after.problems }
}

/**
 * A write that did not happen, and the sentence saying so.
 *
 * A class rather than a returned failure, because `write` has one honest answer
 * and several ways of not having it, and the command turns every one of them into
 * the same code. Recognised with `instanceof` for the reason `BootStop` is: it is
 * ours, so the stronger check is available and a rename cannot quietly stop it
 * being caught.
 */
export class ConfigUnwritable extends Error {}

/**
 * What a write did, in one object rendered two ways.
 *
 * ADR-0005 says the bar for adding a field rises as 1.0 approaches, because a
 * field added casually during 0.x is inherited rather than reconsidered. Four of
 * these look like each other and are not: `value` is the typed thing now in the
 * file, `line` is how the file spells it -- which is the receipt, and the syntax
 * somebody hand-editing needs -- and `effective` is what the next command will
 * actually use, which is a different value whenever a variable shadows it. That
 * last one is the whole of the shadowing report, machine-readable, rather than a
 * boolean somebody would have to trust.
 *
 * `problems` is here for the case the warnings miss: a variable set to something
 * unusable falls through to the file rather than winning, so the write takes
 * effect, nothing is shadowed, and the broken variable would otherwise go
 * unmentioned until the next `config`.
 */
export type Wrote = {
  key: SettingKey
  /** What the file now holds for it. */
  value: string | number
  /** The line the file now carries, which is also the syntax to hand-write. */
  line: string
  /** What the next command will use, and where from. `environment` here is the shadowing. */
  effective: Setting<string> | Setting<number>
  path: string
  /** Sentences the reader must see. Empty is the ordinary case. */
  warnings: string[]
  /** Anything still being ignored, exactly as `config` means it. */
  problems: string[]
  note: string
}

/**
 * Everything above, against the real filesystem.
 *
 * **Every failure is reported, and none is swallowed.** That is the one thing
 * this does differently from `cache.ts`, which shares its write: that file is
 * written for the next run and this one is what the user just asked for, so a
 * silence there is a retry and a silence here is a lie.
 */
export const write = (key: SettingKey, value: string | number, host: Host = thisHost()): Wrote => {
  const path = configFile(host)
  const plan = planned(host, read(path), key, value)

  if (!plan.ok) {
    throw new ConfigUnwritable(
      plan.why === 'unreadable'
        ? `The configuration file at ${path} could not be read: ${plan.because}. Nothing was ` +
            'written, because rewriting it would have thrown away whatever else is in it. ' +
            'Fix it or delete it, then run this again.'
        : `Jukebox could not write that setting down: ${plan.because}. Nothing was written.`,
    )
  }

  try {
    replaceFile(path, plan.text)
  } catch (error) {
    throw new ConfigUnwritable(
      `Jukebox could not write the configuration file at ${path}: ${because(error)}. ` +
        'The file was left as it was.',
    )
  }

  return {
    key,
    value,
    line: plan.line,
    effective: plan.effective,
    path,
    warnings: plan.warnings,
    problems: plan.problems,
    note: NOTE,
  }
}
