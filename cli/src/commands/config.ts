import { defineCommand } from 'citty'
import {
  configuration,
  INTERVAL_VARIABLE,
  LIBRARY_VARIABLE,
  type Configured,
  type Origin,
} from '../config'
import { succeeded, type Renderable } from '../outcome'

/**
 * `jukebox config`: every resolved value, and where each one came from.
 *
 * It reads and reports, and that is the whole of it. There is no `config set`,
 * because the two things it could set are a folder nothing writes to and an
 * interval nothing reads -- a command to change them would be a more convincing
 * promise than the settings themselves are. A value is changed by editing the
 * file or exporting a variable, and this says where both live.
 *
 * Nothing here reaches the network, and nothing creates anything. The first is
 * enforced by never asking the session for a backend, which is how `boot.ts`
 * says a local-only command stays local. The second by there being no code in
 * `config.ts` that could.
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

  const rows = [
    { key: 'library_path', setting: settings.library_path, variable: LIBRARY_VARIABLE },
    {
      key: 'sync_interval_hours',
      setting: {
        ...settings.sync_interval_hours,
        value: String(settings.sync_interval_hours.value),
      },
      variable: INTERVAL_VARIABLE,
    },
  ]

  const keyWidth = widest(rows.map(({ key }) => key))
  const valueWidth = widest(rows.map(({ setting }) => setting.value))

  return [
    ...rows.map(
      ({ key, setting, variable }) =>
        `  ${key.padEnd(keyWidth)}   ${setting.value.padEnd(valueWidth)}   ` +
        `(${came(setting.origin, variable)})`,
    ),
    '',
    whereFrom(file),
    ...(problems.length === 0 ? [] : ['', ...problems]),
    '',
    note,
  ].join('\n')
}

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

const widest = (values: string[]): number => Math.max(...values.map((value) => value.length))

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

export const config = defineCommand({
  meta: {
    name: 'config',
    // No `set`, no `manage`, and no `schedule`. The help text is half of what
    // must not imply that anything acts on what it reports.
    description: 'Show every configured value and where it came from',
  },
  run: reportConfig,
})
