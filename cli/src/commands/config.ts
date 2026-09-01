import { defineCommand } from 'citty'
import {
  configuration,
  ConfigUnwritable,
  isKnown,
  KNOWN,
  understood,
  unknownSetting,
  variableOf,
  write,
  type Configured,
  type Origin,
  type SettingKey,
  type Settings,
  type Wrote,
} from '../config'
import { failed, succeeded, type Renderable } from '../outcome'
import { columns } from '../phrasing'

/**
 * `jukebox config`: every resolved value and where it came from, and -- since
 * #53 -- one of them changed.
 *
 * **Two positional arguments rather than a `config set` subcommand.** `root.ts`
 * says the command tree is one level deep, and `main` resolves a command name
 * against it by hand, looking the first non-flag token up exactly once. `config
 * set` is the first vector that lookup cannot name, so it would mean teaching
 * dispatch to recurse for the sake of one command. #50 asked for `config set` by
 * name; this is the shape that answer takes.
 *
 * The comment that used to be here argued for no `set` at all: the two things it
 * could set are a folder nothing writes to and an interval nothing reads, so a
 * command to change them would be a more convincing promise than the settings
 * themselves are. That was right about the risk and wrong about the remedy.
 * Withholding the command did not make the promise smaller -- it left the user
 * hand-editing TOML to arrive in the same place, believing the same thing. What
 * keeps the promise honest is `NOTE`, and it is printed under every answer this
 * command gives, including the ones that wrote something.
 *
 * Nothing here reaches the network, and that is unchanged: it is enforced by
 * never asking the session for a backend, which is how `boot.ts` says a
 * local-only command stays local. What a write brings into existence is the
 * configuration directory and the file, and nothing else -- no Library folder,
 * not even the one it was just told about.
 */

export const reportConfig = (): Renderable<Configured> => {
  const reported = configuration()

  return succeeded('config', reported, () => human(reported))
}

/**
 * Two aligned columns, where the file is, anything ignored, and the note.
 *
 * The keys are printed under the names they have in the file rather than under
 * prettier labels, so that what a reader sees is what they would have to type to
 * change it.
 */
const human = (reported: Configured): string => {
  const { file, settings, problems, note } = reported

  return [
    ...columns(shown(settings).map(({ key, value, from }) => [key, value, `(${from})`])),
    '',
    whereFrom(file),
    ...(problems.length === 0 ? [] : ['', ...problems]),
    '',
    note,
  ].join('\n')
}

/** One setting, as everything that shows one says it. */
export type Shown = { key: SettingKey; value: string; from: string }

/**
 * Every setting, its value, and where that value came from, in this command's
 * own words.
 *
 * Built from `KNOWN` rather than written out, for the reason `THE_SETTINGS`
 * gives further down: a hand-kept list of the two names is the copy nothing
 * typechecks, and until #57 the rows here were exactly that -- a pair of object
 * literals naming each key and each variable by hand, which a renamed setting
 * would have left printing a key that no longer exists.
 *
 * Exported because #57's menu offers these rows straight back as a picker, and
 * a picker spelling an origin differently from the table printed three lines
 * above it would be the drift ADR-0007 keeps the menu out of. What that costs
 * is one shape rather than two, which is why the value is a string here: the
 * interval is a number everywhere else and a column never was one.
 */
export const shown = (settings: Settings): Shown[] =>
  KNOWN.map((key) => ({
    key,
    value: String(settings[key].value),
    from: came(settings[key].origin, variableOf(key)),
  }))

/**
 * The variable is named, not just the word `environment`.
 *
 * Otherwise a reader who sees `(environment)` and disagrees with the value has
 * nowhere to go: the file in front of them does not contain it, and nothing on
 * screen says which variable to unset. The key names itself in the other two
 * cases, so only this one needs the help.
 */
const came = (origin: Origin, variable: string): string =>
  origin === 'environment' ? `environment: ${variable}` : origin

/**
 * Named in all three cases, because "where would I put one?" is the question
 * somebody reading this output is most likely to have next, and an absent file
 * is the answer almost everybody gets.
 *
 * A file that would not parse is deliberately not described as read. The
 * problem underneath this line says why it was not, and the two contradicting
 * each other is the kind of small dishonesty this command exists to avoid.
 */
const whereFrom = (file: Configured['file']): string => {
  if (file.state === 'absent') {
    return `No configuration file yet. Jukebox would read one at ${file.path}.`
  }

  if (file.state === 'unreadable') return `There is a configuration file at ${file.path}.`

  return `Read from ${file.path}.`
}

/** `a`, `b` and `c`, so a third setting would not read as `a and b and c`. */
const inWords = (items: string[]): string =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * The settings there are, built from `KNOWN` rather than written out.
 *
 * A hand-written list here would be a third copy of the two names, and the one
 * nothing typechecks -- so a renamed setting would leave this sentence naming a
 * key that no longer exists, in the one message a confused reader is relying on.
 */
const THE_SETTINGS = `The settings are ${inWords(KNOWN.map((known) => `\`${known}\``))}.`

/**
 * One sentence for a key that is not a setting, because two callers refuse one.
 *
 * `decide` checks before asking about a value, so that a misspelled key with
 * nothing after it is answered about the key rather than about the missing value.
 * `setConfig` checks because it is exported and #50's menu will call it directly.
 * The guard has to be in both places; the wording does not.
 */
const noSuchSetting = (key: string): Renderable<never> =>
  failed('config', 'invalid_usage', `${unknownSetting(key)}. ${THE_SETTINGS}`)

/**
 * One setting changed, by name.
 *
 * Exported and taking plain strings, so that #50's menu can reach it the way it
 * will reach `addPlaylist` -- the menu is a launcher, and a screen that edited
 * configuration itself would be the first thing in it that no flag can do.
 */
export const setConfig = (key: string, typed: string): Renderable<Wrote> => {
  if (!isKnown(key)) return noSuchSetting(key)

  const value = understood(key, typed)
  if (!value.ok) {
    return failed(
      'config',
      'invalid_usage',
      `\`${key}\` cannot be set to \`${typed}\`: ${value.because}. Nothing was written.`,
    )
  }

  try {
    const written = write(key, value.value)

    return succeeded('config', written, () => wrote(written))
  } catch (error) {
    // The one thing this must never do is what `cache.ts` does with the same
    // write. A swallowed failure here tells somebody their setting was saved.
    if (error instanceof ConfigUnwritable) {
      return failed('config', 'config_unwritable', error.message)
    }

    throw error
  }
}

/**
 * The line that is now in the file, then anything the reader must know, then the
 * same note the reading rendering ends with.
 *
 * The serialised line rather than a one-row table, and it does three jobs at
 * once: it is the receipt, it teaches the quoting rule somebody hand-editing the
 * file will need, and it is the only place a reader finds out what was actually
 * stored -- `Number('0x10')` is 16, so what went in is not always what was typed.
 *
 * Laid out the way `human` above lays its answer out, so the two things this one
 * command can say do not read as two different commands.
 */
const wrote = (written: Wrote): string => {
  const { line, path, warnings, problems, note } = written

  return [
    `Wrote ${line} to ${path}.`,
    ...(warnings.length === 0 ? [] : ['', ...warnings]),
    ...(problems.length === 0 ? [] : ['', ...problems]),
    '',
    note,
  ].join('\n')
}

/**
 * What the vector asked for, in the order the answers are worth giving.
 *
 * The count is checked first and the key second, so that the two ways of getting
 * nothing done -- too many words, or a word Jukebox does not know -- are both
 * answered before anything looks at a value. Reading every setting comes next,
 * and it is reached before anything can fail, which is what keeps `jukebox
 * config` behaving exactly as it did.
 */
const decide = (
  key: string | undefined,
  value: string | undefined,
  positionals: string[],
): Renderable => {
  // citty fills the two positionals it was told about and silently drops the
  // rest, so an unquoted path with a space in it arrives here as `C:\My` with
  // nothing said. Writing a truncated path and reporting success is the worst
  // thing this command could do, and `args._` is the only place the third word
  // still exists to notice.
  if (positionals.length > 2) {
    return failed(
      'config',
      'invalid_usage',
      '`jukebox config` takes one setting and one value, and it was given ' +
        `${positionals.length} words. Quote the value if it has spaces in it: ` +
        '`jukebox config library_path "D:\\My Music\\Jukebox"`.',
    )
  }

  if (key === undefined) return reportConfig()

  if (!isKnown(key)) return noSuchSetting(key)

  if (value === undefined) {
    return failed(
      'config',
      'invalid_usage',
      `No value given. \`jukebox config ${key} <value>\` sets it, and \`jukebox config\` on ` +
        'its own shows every setting.',
    )
  }

  return setConfig(key, value)
}

export const config = defineCommand({
  meta: {
    name: 'config',
    // Both halves, because a command's own help is where somebody finds out this
    // can write at all. Still no `schedule` and no `manage`: the interval can now
    // be set, and there is still nothing anywhere that reads it.
    description: 'Show every setting and where it came from, or set one',
  },
  args: {
    // Optional, unlike `add`'s. citty treats a positional with no default as
    // required and refuses a missing one before `run` is reached; `required:
    // false` is what turns that off and renders `[KEY]` rather than `<KEY>` in
    // the usage, which is the whole difference between a command that may take an
    // argument and one that must.
    key: {
      type: 'positional',
      required: false,
      description: 'The setting to change. Leave it out to show every setting',
    },
    value: {
      type: 'positional',
      required: false,
      description: 'What to change it to',
    },
  },
  run: ({ args }) => decide(args.key, args.value, args._),
})
