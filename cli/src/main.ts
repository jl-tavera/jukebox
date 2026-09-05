import { renderUsage, runCommand, type ArgsDef, type CommandDef, type Resolvable } from 'citty'
import { BootStop } from './boot'
import { reportVersion } from './commands/version'
import { ConfigUnwritable } from './config'
import { DISCOVERY_URL } from './discovery'
import type { Io } from './io'
import { confirming, menu } from './menu'
import { MirrorUnopenable } from './mirror'
import { promptsAllowed, selectMode } from './mode'
import { failed, succeeded, type Renderable } from './outcome'
import { render } from './render'
import { root as jukebox } from './root'
import { lazily, PATIENCE, type Patience, type Session } from './session'
import { JSON_STABILITY, VERSION } from './version'

/**
 * The things a caller may replace, and the only ones.
 *
 * `root` was already here as a bare third parameter; `discovery` joins it
 * because it is the same category of thing -- something a test replaces to
 * reach a path the real program has no way to reach -- and two anonymous
 * positionals of that category is one too many. `test/harness.ts`'s own
 * `Options` is the precedent for naming them rather than counting them.
 *
 * Not an environment variable. `JUKEBOX_API` is a documented affordance a
 * developer is meant to reach for; this is where the program's single
 * compiled-in address lives, and making that configurable at runtime would ship
 * a second address override the documentation would then have to explain the
 * difference between.
 */
export type Seams = {
  /** A command tree of the caller's own. See the note on `main`. */
  root?: CommandDef
  /** Where the discovery document is read from. The site's own address by default. */
  discovery?: string
  /**
   * How long a command waits for work it did not start. The shipped default
   * unless a test shortens it, which is the only way the giving-up branch is
   * reachable inside a test suite that has to finish.
   */
  patience?: Patience
}

/**
 * The whole of the program, and the only thing that decides anything.
 *
 * It returns an exit code rather than taking one, and takes its streams rather
 * than reaching for them, so a test drives exactly the path a shell drives with
 * no process to spawn. The seams are injectable for the same reason
 * `worker/test/api.ts` hands the worker bindings of a test's own: they reach
 * paths the real tree has no way to reach, and nothing in here is shaped
 * differently because of it.
 *
 * The shape is compute, then render. Every command returns one result object
 * and prints nothing on the way, which is what makes machine output a property
 * of this function rather than something added to each command later. A warning
 * raised on the way is carried out to `render` rather than printed where it
 * arose, so that this stays true of warnings too and `render` stays the only
 * thing that writes.
 */
export const main = async (argv: string[], io: Io, seams: Seams = {}): Promise<number> => {
  const mode = selectMode(asked(argv, JSON_FLAGS), io)

  // Collected rather than printed where they arise, so that `render` stays the
  // only thing that writes and the shape stays compute-then-render. A warning
  // emitted from inside the boot would be a second writer, and the first crack
  // in the property that makes machine output belong to this function.
  const warnings: string[] = []
  const session: Session = {
    backend: lazily(seams.discovery ?? DISCOVERY_URL, (text) => void warnings.push(text)),
    patience: seams.patience ?? PATIENCE,
    // Built here because this is where both halves of the answer are: the mode,
    // and the streams. A command is handed the result rather than the question,
    // so nothing below has to remember to check before asking.
    ask: promptsAllowed(mode, io) ? confirming(io) : null,
  }

  const root = seams.root ?? jukebox

  // The one path that does not answer with a result object, because it cannot:
  // a menu session is a loop rather than one answer, and what it exits with is
  // not an outcome's. What it launches is another matter -- every entry hands
  // back an argument vector and gets the two lines below it, so a command run
  // from the menu is computed, rendered and counted exactly as the same command
  // typed at a shell. That is the launcher rule, docs/adr/0007, and the reason
  // a menu does not fork this program into two behaviours.
  //
  // Gated on the raw empty vector rather than on `dispatch` finding no command,
  // and the two are not the same thing: `jukebox --nonsense` names no command
  // either, and opening a menu that silently swallowed the flag would be worse
  // than the failure it gets today. `promptsAllowed` is the whole of the rest of
  // the condition -- it is false in JSON mode, false into a pipe or a redirect,
  // and false when nobody is at the keyboard, which is every case #50 requires
  // to keep failing exactly as it does.
  if (argv.length === 0 && promptsAllowed(mode, io)) {
    return await menu(io, async (vector, computed) => {
      const answer = await compute(vector, root, session)

      // The seam the menu cannot see for itself, and the whole of why `Launch`
      // takes a second argument. A launch is compute *and* render, so chrome
      // stopped when one returns is chrome that was still on the screen while
      // the other wrote: a spinner ticking through `render` erases the first
      // line of the answer it was covering. This says the answer is in and not
      // yet shown, which is the one moment the screen has to be clear by.
      computed?.()

      // Drained rather than read, so that a warning raised on the way through
      // one command is printed above that command's own output and not again
      // above the next one's. The boot is memoised, so in practice this fires
      // for the first command in a session that touches the network.
      render(answer, mode, VERSION, io, warnings.splice(0))

      return answer
    })
  }

  const renderable = await compute(argv, root, session)
  render(renderable, mode, VERSION, io, warnings)

  // Zero for every answer the CLI was built to give, non-zero only where the
  // CLI itself could not give one. All five of the server's answers -- nothing
  // changed, changed, still resolving, gone, temporarily unreachable -- reach
  // `sync` as `ok`, and so does a Playlist it could not reach at all: a tool
  // that exits non-zero on the answer it receives most often cannot be
  // scheduled. What is left non-zero is a boot that stopped, a Mirror that
  // would not open, a vector naming no command, and a vector naming a Playlist
  // this machine does not track. That last one is the same kind of thing as the
  // typo: somebody named one specific thing, and there is no answer to give
  // about it.
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

const compute = async (
  argv: string[],
  root: CommandDef,
  session: Session,
): Promise<Renderable> => {
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

    const { result } = await runCommand(named.command, {
      rawArgs: named.rest,
      // citty hands this straight to `ctx.data`. A thunk rather than a booted
      // backend, because that is what makes "commands that read only local
      // state work with no network at all" a property of the shape rather than
      // a list somebody has to keep in step with the command tree.
      data: session,
    })

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

    // A boot that stopped, which is a decision rather than a fault: the version
    // gate refused, the backend said it was down, or there was no way to find
    // out where the backend is. Recognised with `instanceof` where citty's
    // error below is recognised by name, and the difference is not taste --
    // citty does not export its class and this one is ours, so the stronger
    // check is available here and a rename cannot quietly stop it being caught.
    if (cause instanceof BootStop) return failed('jukebox', cause.code, cause.message)

    // The Mirror could not be opened, or could not be brought up to date. Five
    // commands used to convert this themselves, which is #70: five copies of one
    // sentence, and the copies had already begun to disagree about neighbouring
    // things. The thing that knows throws and this converts, exactly as the boot
    // above does, so a sixth command reading the Mirror inherits the answer.
    if (cause instanceof MirrorUnopenable) {
      return failed('jukebox', 'mirror_unopenable', cause.message)
    }

    // A setting that was not written, which is its own code rather than
    // `unexpected` for the reason `errors.ts` gives: a read-only home and a full
    // disk are not bugs in this binary. Why it is never swallowed on the way here
    // is `config.ts`'s `write` to say, and it says it.
    if (cause instanceof ConfigUnwritable) {
      return failed('jukebox', 'config_unwritable', cause.message)
    }

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
