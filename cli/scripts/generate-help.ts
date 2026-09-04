import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderUsage, type ArgsDef, type CommandDef, type Resolvable } from 'citty'
import { ENTRIES, WHAT_NEXT } from '../src/menu'
import { root } from '../src/root'

/**
 * Writes the binary's own help into the page that quotes it, from the command
 * definitions under `cli/src/commands/` and the menu in `cli/src/menu.ts`.
 *
 * **The generator `site/lib/content.ts` has been naming since #82.** Two of its
 * constants carried the same confession -- "a second copy, and CI cannot yet see
 * the two disagree" -- and both named #87 as the expiry. Until this existed, a
 * reworded description left the landing page describing the binary in words the
 * binary had stopped using, silently, for as long as it took somebody to notice
 * by reading both.
 *
 * **Generated, then diffed, rather than compared.** `generate-wordmark.ts`'s
 * shape and #60's reasoning, which `cli.yml` and `worker.yml` between them now
 * use four times: regenerate, `git diff --exit-code`, and a copy that no longer
 * matches its source is a diff rather than a comparison nobody ran.
 *
 * **It imports where the wordmark generator reads bytes, and the inversion is
 * deliberate.** That script refuses to import for two reasons and neither one
 * reaches here. ECMAScript normalises CRLF inside a template literal, so two
 * files whose bytes differ hand back the same string -- but a description is a
 * single-line literal that no checkout can lengthen, and nothing here is
 * measured in columns. And an import would have pulled a *site* file into the
 * CLI's typecheck program -- but what is read here is `cli/src/root.ts`, already
 * inside that program, which is the reason both scripts live in this directory.
 * The site file is still only ever spliced, never imported.
 *
 * **citty owns every spelling, and this script owns the zip.** The usage line is
 * lifted out of `renderUsage`'s own output rather than rebuilt from the argument
 * table, so `<URL>` and `[KEY]` are citty's words about citty's rules. What gets
 * reconstructed is only which description belongs to which spelling, and
 * `zipped` below fails rather than guesses when the two stop lining up. A
 * generator that reimplemented `required !== false && default === undefined`
 * would agree with itself forever and disagree with the binary after an upgrade.
 *
 * **The ANSI strip is not cosmetic.** citty decides on colour from `NO_COLOR`,
 * `TERM`, `TEST` and `CI` alone -- never from whether a stream is a terminal --
 * so the bytes it hands back depend on the environment the generator ran in.
 * Two people would commit two different files and CI would diff against
 * whichever ran last. Stripping is what makes this output a function of the
 * source and nothing else, which is what `git diff --exit-code` is standing on.
 *
 * Deliberately not carried: the root's `--json`, because `renderUsage` renders a
 * command's own arguments and no subcommand declares one; and the sentence
 * `main.ts` appends about JSON stability, because it describes a mode this page
 * cannot show. `[OPTIONS]` stays inside the usage lines, because it is what the
 * binary prints and `main.ts` does read `--json` off any vector.
 */

/** The source, in the sense that matters: where a description is edited. */
const COMMANDS = 'cli/src/commands/'
const MENU = 'cli/src/menu.ts'

/** The one file written, and the three declarations spliced inside it. */
const SITE = 'site/lib/content.ts'

/** Resolved against this file rather than the cwd, so where it is run from does not matter. */
const at = (repoPath: string): string => fileURLToPath(new URL(`../../${repoPath}`, import.meta.url))

/**
 * Annotated on the binding rather than on the arrow, for `generate-wordmark.ts`'s
 * reason: TypeScript narrows after a call only when the *variable* is typed as
 * returning `never`, and with the annotation on the arrow alone every bare
 * `fail(...)` below would leave the code after it reachable.
 */
const fail: (...lines: string[]) => never = (...lines) => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

/**
 * citty lets a command declare its metadata, arguments and subcommands as a
 * value, a promise, or a function returning either. `main.ts` carries this same
 * unwrap for the same reason: nothing in this tree does anything but the first,
 * and this is what keeps that from being an assumption.
 */
const settle = async <T>(value: Resolvable<T> | undefined): Promise<T | undefined> =>
  typeof value === 'function' ? await (value as () => T | Promise<T>)() : await value

/** SGR escapes, which is all citty emits. See the note on colour above. */
const ANSI = /\u001b\[[0-9;]*m/g

/** What citty opens the usage line with. */
const USAGE = 'USAGE '

/** An argument, spelled as the usage line spells it: `<URL>` required, `[KEY]` not. */
type Argument = { name: string; description: string }

type Documented = { name: string; summary: string; usage: string; args: Argument[] }

/**
 * One string, checked for everything that would stop it being one line of a
 * TypeScript literal, and escaped for the quotes it is about to sit inside.
 *
 * The escaping is real rather than defensive: `remove` and `show` both describe
 * an argument with a backticked `jukebox list` in it, and a description with an
 * apostrophe is a rewording away at any time.
 */
const literal = (what: string, value: string): string => {
  if (/[\n\r]/.test(value)) {
    fail(
      `${what} runs onto a second line, and every string this writes is one line.`,
      'The page lays these out in its own grid, so a newline inside one would put a row',
      'somewhere the layout did not choose.',
    )
  }

  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** The same, wrapped in the quotes the file will carry. */
const quoted = (what: string, value: string): string => `'${literal(what, value)}'`

/**
 * The usage line as the binary prints it, and the positional spellings in it.
 *
 * Everything after the command's own name, which is where citty puts
 * `[OPTIONS]` and then one token per positional in declaration order.
 */
const usageOf = (name: string, rendered: string): { usage: string; spellings: string[] } => {
  const line = rendered.split('\n').find((one) => one.startsWith(USAGE))

  if (line === undefined) {
    fail(
      `citty rendered no usage line for \`${name}\`, so there is nothing to quote.`,
      `This script reads the line opening with ${USAGE.trim()} out of renderUsage's own output,`,
      'which is what keeps the page from reimplementing how an argument is spelled.',
    )
  }

  // Two tokens in and the rest: citty writes `jukebox <name>` and then
  // `[OPTIONS]`, which is chrome about a flag no subcommand declares.
  const usage = line.slice(USAGE.length).trimEnd()
  const spelled = usage.split(/\s+/).slice(2)

  return { usage, spellings: spelled.filter((token) => token !== '[OPTIONS]') }
}

/**
 * Which description belongs to which spelling, or a failure saying they stopped
 * lining up.
 *
 * The two halves come from different places on purpose. citty spells the
 * arguments and this script must not second-guess it; the descriptions are on
 * the definitions, and citty pads them into a column that would have to be
 * unpadded to read back. Pairing by position is the smallest join that needs no
 * parsing of either, and the check below is what makes it safe: a spelling whose
 * bare name is not its key means one order moved and the other did not, and the
 * generator stops rather than mislabelling an argument on a public page.
 */
const zipped = (name: string, args: [string, ArgsDef[string]][], spellings: string[]): Argument[] => {
  if (args.length !== spellings.length) {
    fail(
      `\`${name}\` declares ${args.length} argument(s) and citty's usage line shows ${spellings.length}.`,
      `The line reads: ${spellings.join(' ')}`,
      'Every argument in this tree is a positional and this script pairs them by position.',
      'One citty renders somewhere other than the usage line has to be taught about here.',
    )
  }

  return args.map(([key, arg], index) => {
    const spelling = spellings[index]!
    const bare = spelling.replace(/[<>[\]]/g, '')

    if (bare !== key.toUpperCase()) {
      fail(
        `\`${name}\` declares \`${key}\` where citty's usage line has ${spelling}.`,
        'The two are paired by position, so this means one order moved and the other did not.',
        "Nothing is written: an argument carrying another argument's description would be a",
        'wrong answer on a page whose whole job is not being one.',
      )
    }

    const description = (arg.description ?? '').trim()

    if (description === '') {
      fail(
        `\`${name} ${spelling}\` has no description, so the page would print a bare spelling.`,
        `Give it one in ${COMMANDS}${name}.ts. A page quoting six descriptions out of seven is`,
        'a page a reader has to distrust for the other six.',
      )
    }

    return { name: spelling, description }
  })
}

/** One command, as the page will quote it. */
const documented = async (name: string, command: CommandDef): Promise<Documented> => {
  const meta = (await settle(command.meta)) ?? {}
  const args = (await settle(command.args)) ?? {}
  const subCommands = (await settle(command.subCommands)) ?? {}

  if (Object.keys(subCommands).length > 0) {
    fail(
      `\`${name}\` has subcommands, and this script reads a tree one level deep.`,
      "`cli/src/root.ts` says the tree stays that way. If that stopped being true, the page's",
      'help has to grow a level before this can generate it.',
    )
  }

  const declared = Object.entries(args)
  const flags = declared.filter(([, arg]) => arg.type !== 'positional')

  if (flags.length > 0) {
    fail(
      `\`${name}\` declares ${flags.map(([key]) => `--${key}`).join(', ')}, which citty puts under OPTIONS.`,
      'This script reads the usage line and the positionals in it, so it would drop an option',
      'silently -- the exact divergence it exists to prevent. Teach it about options first.',
    )
  }

  const summary = (meta.description ?? '').trim()

  if (summary === '') {
    fail(
      `\`${name}\` has no description, so the page would list it with nothing beside it.`,
      `Give it one in ${COMMANDS}${name}.ts.`,
    )
  }

  const rendered = (await renderUsage(command, root)).replace(ANSI, '')

  if (!rendered.includes(summary)) {
    fail(
      `\`${name}\`'s description is not in what citty rendered for it.`,
      'Both are read from the same definition, so one of them was transformed on the way --',
      'an escape that survived the strip, or a description citty reflowed.',
    )
  }

  const { usage, spellings } = usageOf(name, rendered)

  return { name, summary, usage, args: zipped(name, declared, spellings) }
}

const readSite = (): string => {
  try {
    return readFileSync(at(SITE), 'utf8')
  } catch {
    return fail(`${SITE} is not there.`)
  }
}

/**
 * What the file should contain, with the bytes between a declaration and what
 * closes it replaced -- or nothing, where it already says this.
 *
 * `generate-wordmark.ts`'s splice, widened from one declaration to three and
 * from a backtick to whatever closes each. Spliced rather than written whole for
 * that script's reason, which is stronger here: `content.ts` also holds the
 * wordmark *that* script writes, the install commands, the hero copy and the
 * donation rows, and every one of them carries a docblock this script knows
 * nothing about.
 *
 * It computes and does not write, which is why it is separate from the loop
 * below. A run that is going to fail has to fail before the first byte lands, or
 * a later declaration whose shape moved leaves an earlier one already rewritten
 * -- a failed run that changed the tree, which is the one outcome a
 * `git diff --exit-code` guard must not have.
 */
const spliced = (
  source: string,
  what: string,
  opens: string,
  closes: string,
  body: string,
): string | undefined => {
  const declared = source.split(opens).length - 1

  if (declared !== 1) {
    return fail(
      declared === 0
        ? `${SITE} does not declare ${what}.`
        : `${SITE} declares ${what} ${declared} times, and must declare it once.`,
      `This script finds it by reading: ${opens}`,
      'Renaming the constant, annotating its type, or reformatting the declaration all hide it',
      'from here. Update this script alongside whichever it was.',
    )
  }

  // **What closes a declaration must be something its body cannot contain.**
  // Not a style note: the body is written back between the two, so a body
  // holding the terminator makes the *next* run stop early and splice into the
  // middle of what this one wrote. It corrupts on the second run rather than
  // the first, reports success both times, and the file it breaks is the one CI
  // diffs. Checked here rather than trusted, because the three declarations
  // below each satisfy it for a different reason.
  if (body.includes(closes)) {
    return fail(
      `The generated ${what} contains ${JSON.stringify(closes)}, which is what closes it.`,
      'Splicing it in would leave a file this script cannot read back, on the run after the',
      'one that wrote it. Give this declaration a terminator its body cannot hold.',
    )
  }

  const from = source.indexOf(opens) + opens.length
  const ends = source.indexOf(closes, from)

  if (ends === -1) {
    return fail(
      `${SITE} opens ${what} and never closes it.`,
      `This script reads on to the next ${JSON.stringify(closes)}, which is how the bytes`,
      'between the two are known to be all of it.',
    )
  }

  // Nothing to write where nothing changed, so a second run is silent and the
  // report below can name the declarations that actually moved.
  if (source.slice(from, ends) === body) return undefined

  return source.slice(0, from) + body + source.slice(ends)
}

/**
 * One entry per line, indented into an array literal that has already opened.
 *
 * No newline after the last entry: what closes these is `\n]`, so a trailing one
 * would leave a blank line above every closing bracket this writes.
 */
const listed = (items: string[]): string =>
  `\n${items.map((item) => `  ${item},`).join('\n')}`

const subCommands = (await settle(root.subCommands)) ?? {}

const commands: Documented[] = []

for (const [name, command] of Object.entries(subCommands)) {
  const settled = await settle(command)
  if (settled === undefined) fail(`\`${name}\` is in the tree and resolves to nothing.`)
  commands.push(await documented(name, settled))
}

if (commands.length === 0) {
  fail(
    '`cli/src/root.ts` declares no subcommands, so there is no help to write.',
    'The page lists what the binary lists, and an empty list would be a page claiming the',
    'binary does nothing.',
  )
}

/**
 * The menu's entries, as the page quotes them.
 *
 * `runs` is the one field here the CLI does not own, and `content.ts` says so at
 * length: it is the page's, and it is what makes an entry launch the command it
 * names rather than print something no prompt would. ADR-0007 is where that
 * comes from -- every entry in the real menu launches a command that already
 * exists -- so the value written is the entry's own, and `quit` alone carries
 * none, because the way out launches nothing.
 */
const entries = ENTRIES.map((entry) => {
  const fields = [
    `label: ${quoted('A menu label', entry.label)}`,
    `hint: ${quoted('A menu hint', entry.hint)}`,
  ]

  if (entry.value !== 'quit') {
    fields.push(`runs: ${quoted('What a menu entry runs', entry.value)}`)
  }

  return `{ ${fields.join(', ')} }`
})

const written = commands.map((command) => {
  const args =
    command.args.length === 0
      ? '[]'
      : `[\n${command.args
          .map((arg) => {
            const name = quoted('An argument spelling', arg.name)
            const description = quoted(`\`${command.name} ${arg.name}\``, arg.description)
            return `      { name: ${name}, description: ${description} },\n`
          })
          .join('')}    ]`

  return [
    '{',
    `    name: ${quoted('A command name', command.name)},`,
    `    summary: ${quoted(`\`${command.name}\`'s description`, command.summary)},`,
    `    usage: ${quoted(`\`${command.name}\`'s usage line`, command.usage)},`,
    `    args: ${args},`,
    '  }',
  ].join('\n')
})

/** The three declarations, in the order they appear in the file. */
const DECLARATIONS = [
  {
    // The quotes are part of the body rather than the anchors, so what closes
    // this is the end of the line. Anchoring on the opening quote and closing on
    // the next one reads more naturally and is wrong: `literal` escapes an
    // apostrophe to a backslash and a quote, and the scan for the closing quote
    // would stop on the quote half of it.
    // `literal` already refuses a newline, so a body that reaches the terminator
    // is unrepresentable here rather than merely unlikely.
    what: "the menu's question",
    opens: 'export const WHAT_NEXT = ',
    closes: '\n',
    body: quoted("The menu's question", WHAT_NEXT),
  },
  {
    what: "the menu's entries",
    opens: 'export const MENU_ENTRIES: readonly Option[] = [',
    closes: '\n]',
    body: listed(entries),
  },
  {
    what: "the binary's commands",
    opens: 'export const CLI_COMMANDS: readonly CliCommand[] = [',
    closes: '\n]',
    body: listed(written),
  },
]

// Every declaration located and checked before any of them is written, which is
// what `spliced` computing rather than writing is for. Each splice is taken
// against the result of the last so that the offsets it found stay true.
const moved: string[] = []
let carried = readSite()

for (const { what, opens, closes, body } of DECLARATIONS) {
  const text = spliced(carried, what, opens, closes, body)
  if (text === undefined) continue

  moved.push(what)
  carried = text
}

if (moved.length > 0) writeFileSync(at(SITE), carried)

const shape = `${commands.length} commands and ${ENTRIES.length} menu entries`

console.log(
  moved.length === 0
    ? `${SITE} already carries ${COMMANDS} and ${MENU}: ${shape}.`
    : `Wrote ${moved.join(', ')} into ${SITE}: ${shape}.`,
)
