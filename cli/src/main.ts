import { renderUsage, runCommand, type ArgsDef, type CommandDef, type Resolvable } from 'citty'
import { reportVersion } from './commands/version'
import type { Io } from './io'
import { selectMode } from './mode'
import { failed, succeeded, type Renderable } from './outcome'
import { render } from './render'
import { root as jukebox } from './root'
import { JSON_STABILITY, VERSION } from './version'

/**
 * The whole of the program, and the only thing that decides anything.
 *
 * It returns an exit code rather than taking one, and takes its streams rather
 * than reaching for them, so a test drives exactly the path a shell drives with
 * no process to spawn. `root` is injectable for the same reason
 * `worker/test/api.ts` hands the worker bindings of a test's own: it reaches
 * paths the real tree has no way to reach, and nothing in here is shaped
 * differently because of it.
 *
 * The shape is compute, then render. Every command returns one result object
 * and prints nothing on the way, which is what makes machine output a property
 * of this function rather than something added to each command later.
 */
export const main = async (argv: string[], io: Io, root: CommandDef = jukebox): Promise<number> => {
  const mode = selectMode(asked(argv, JSON_FLAGS), io)

  const renderable = await compute(argv, root)
  render(renderable, mode, VERSION, io)

  // Zero for every answer the CLI was built to give, non-zero only where the
  // CLI itself could not give one. When Sync lands, all five of the server's
  // answers -- nothing changed, changed, still resolving, gone, temporarily
  // unreachable -- are `ok`: a tool that exits non-zero on the answer it
  // receives most often cannot be scheduled.
  return renderable.outcome.ok ? 0 : 1
}

const HELP_FLAGS = ['--help', '-h']
const VERSION_FLAGS = ['--version', '-v']
const JSON_FLAGS = ['--json']

/**
 * Whether a flag was asked for anywhere it counts.
 *
 * Read off the raw vector rather than from parsed arguments, because every flag
 * here applies to the whole run wherever it was written: `jukebox --json
 * version` puts it on the root and `jukebox version --json` puts it on the
 * command, and they mean the same thing.
 *
 * `--` ends the search, for the reason it always does: what follows it is an
 * argument that happens to look like a flag. `commandIndex` stops there too,
 * and the two disagreeing would be the subtle kind of bug -- a URL carrying
 * `--json` would change how its own command rendered.
 */
const asked = (argv: string[], flags: string[]): boolean => {
  for (const arg of argv) {
    if (arg === '--') return false
    if (flags.includes(arg)) return true
  }

  return false
}

const compute = async (argv: string[], root: CommandDef): Promise<Renderable> => {
  try {
    const named = await dispatch(argv, root)

    // Before help, because there is no help for a command that does not exist:
    // answering `jukebox sing --help` with the root's usage and a zero exit
    // would tell a script the typo worked.
    if (named.kind === 'unknown') {
      return failed(
        'jukebox',
        'invalid_usage',
        'There is no `jukebox ' +
          named.name +
          '` command. Run `jukebox --help` to see what there is.',
      )
    }

    if (asked(argv, HELP_FLAGS)) return await usageOf(root, named)

    // `--version` is the root's own flag, so it answers when nothing else was
    // asked for. `jukebox version` is the same question asked by name.
    if (named.kind === 'none' && asked(argv, VERSION_FLAGS)) return reportVersion()

    if (named.kind === 'none') {
      return failed(
        'jukebox',
        'invalid_usage',
        'No command given. Run `jukebox --help` to see what there is.',
      )
    }

    const { result } = await runCommand(named.command, { rawArgs: named.rest })

    // citty types a command's return as `any`, so this is the one place the
    // shape every command promises is taken on trust. Checked rather than cast,
    // because `render` runs outside this catch and a command that returned
    // nothing would crash there instead of being answered here.
    if (!isRenderable(result)) {
      throw new Error('the ' + named.name + ' command returned no result object')
    }

    return result
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))

    // citty's own error, which it raises for an argument vector it cannot
    // parse. The class is not exported, so it is recognised by name. A usage
    // problem, and it reads as one.
    if (cause.name === 'CLIError') return failed('jukebox', 'invalid_usage', cause.message)

    // Everything else is a bug, and it still comes back as a result object: the
    // alternative in JSON mode is a stack trace on stdout, which every caller
    // parsing it meets instead of a code it could branch on.
    return failed(
      'jukebox',
      'unexpected',
      'Jukebox hit a problem it has no answer for: ' + cause.message,
    )
  }
}

/** What an argument vector named, if anything, and what is left for it to parse. */
type Named =
  | { kind: 'none' }
  | { kind: 'unknown'; name: string }
  | { kind: 'found'; name: string; command: CommandDef; rest: string[] }

/**
 * Resolved here rather than by citty, because `runCommand` runs a subcommand
 * and then discards what it returned -- and what it returns is the result
 * object everything else rests on. citty still parses the arguments, types them
 * and renders the usage; only the one step it cannot give back is done by hand.
 *
 * The rule is citty's own: the first argument that is not a flag names the
 * command, and a flag that takes a value swallows the one after it.
 */
const dispatch = async (argv: string[], root: CommandDef): Promise<Named> => {
  const args = (await settle(root.args)) ?? {}
  const index = commandIndex(argv, args)
  if (index === -1) return { kind: 'none' }

  const name = argv[index]!
  const subCommands = (await settle(root.subCommands)) ?? {}
  const command = await settle(subCommands[name])
  if (command === undefined) return { kind: 'unknown', name }

  return { kind: 'found', name, command, rest: argv.slice(index + 1) }
}

const commandIndex = (argv: string[], args: ArgsDef): number => {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--') return -1
    if (!arg.startsWith('-')) return i
    if (!arg.includes('=') && takesAValue(arg, args)) i += 1
  }

  return -1
}

const takesAValue = (flag: string, args: ArgsDef): boolean => {
  const name = flag.replace(/^-+/, '')

  for (const [key, arg] of Object.entries(args)) {
    if (arg.type !== 'string' && arg.type !== 'enum') continue
    if (key === name) return true

    const aliases = arg.alias === undefined ? [] : [arg.alias].flat()
    if (aliases.includes(name)) return true
  }

  return false
}

/**
 * Help, which is a result object like everything else.
 *
 * Both renderings describe the same command -- the one the vector named, or the
 * root when it named none -- so `jukebox version --help` cannot answer about
 * `version` in one mode and about the whole program in the other. The human
 * half is citty's usage; the machine half is the list an agent would otherwise
 * have to parse out of it.
 */
const usageOf = async (root: CommandDef, named: Named): Promise<Renderable> => {
  const [command, parent] =
    named.kind === 'found' ? ([named.command, root] as const) : ([root, undefined] as const)

  const meta = (await settle(command.meta)) ?? {}
  const subCommands = (await settle(command.subCommands)) ?? {}

  const commands = await Promise.all(
    Object.keys(subCommands).map(async (name) => {
      const subCommand = await settle(subCommands[name])
      const subMeta = await settle(subCommand?.meta)
      return { name, description: subMeta?.description ?? '' }
    }),
  )

  // Said on every help rather than only the root's. `--json` is a property of
  // the whole program, and a command's own help is at least as likely to be
  // where somebody reads about it.
  const usage = (await renderUsage(command, parent)) + '\n' + JSON_STABILITY

  return succeeded(
    'help',
    {
      name: meta.name ?? 'jukebox',
      description: meta.description ?? '',
      commands,
      jsonStability: JSON_STABILITY,
    },
    () => usage,
  )
}

const isRenderable = (value: unknown): value is Renderable =>
  typeof value === 'object' && value !== null && 'outcome' in value && 'human' in value

/**
 * citty lets a command declare its metadata, arguments and subcommands as a
 * value, a promise, or a function returning either. Nothing here does anything
 * but the first, and this is what keeps that from being an assumption.
 */
const settle = async <T>(value: Resolvable<T> | undefined): Promise<T | undefined> =>
  typeof value === 'function' ? await (value as () => T | Promise<T>)() : await value
