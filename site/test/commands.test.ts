import { describe, expect, it } from 'bun:test'
import { CLI_COMMANDS, HOST, type CliCommand } from '../lib/content'
import { ARROW, COMMANDS, find, NO_ARGUMENTS, PROMPTS, run } from '../lib/session/commands'
import { commandFor, copying, PICKER } from '../lib/session/install'
import { spoken, text, type Line } from '../lib/session/lines'

/**
 * What the page answers, and in whose voice.
 *
 * ADR-0010 makes the voice a rule rather than a flourish -- the binary's
 * vocabulary and the site's are never dressed as each other -- so the echo is
 * asserted through `PROMPTS` rather than against a retyped string. Two strings
 * are pinned by hand instead -- the not-found copy, which #85 pinned, and the
 * leftovers sentence #87 added -- and both are pinned for the same reason,
 * given where each is asserted: they are sentences the *page* wrote, so the
 * literal is the acceptance criterion and importing the module's own constant
 * would assert nothing.
 *
 * **Since #87 nothing a binary command says is written down here.** Its
 * descriptions, usage lines and arguments are generated into `lib/content.ts`
 * from `cli/src/commands/`, and `test/header.test.ts` states the rule this file
 * now inherits: a copy typed into a test would be a third one that no diff
 * checks. So the expectations below are computed from the import, and what they
 * pin is the *shape* the page puts around it -- which column, which order,
 * which blank line -- rather than the words, which CI diffs against the binary.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

/** Every word on these lines the cursor can land on, by what it would run. */
const landable = (lines: readonly Line[]): string[] =>
  lines
    .flatMap((line) => (line.kind === 'text' ? line.spans : []))
    .flatMap((span) => (span.runs === undefined ? [] : [span.runs]))

const documented = (name: string): CliCommand => CLI_COMMANDS.find((one) => one.name === name)!

/**
 * The leftovers sentence as it is printed, backticks and all.
 *
 * The second of the two hand-pinned strings the header names, and pinned for
 * the not-found copy's reason: the page wrote this sentence, so the literal is
 * the criterion. `NO_ARGUMENTS` is the spoken form and is asserted against
 * separately -- deriving one from the other would only restate how `noArguments`
 * puts the backticks in.
 */
const LEFTOVERS = 'Only `help` and `install` take an argument here.'

/**
 * The two sentences #91 adds, pinned by hand for the header's reason.
 *
 * Both are the page's own words rather than a quotation of anything, so the
 * literal is the criterion: `COPIED` is the confirmation the ticket asks a
 * chosen system for, and `unknown` is what a word the picker does not offer
 * gets instead of silence.
 */
const COPIED = 'Copied. Paste it into a terminal.'

const unknown = (word: string): string => `${HOST}: no install command for ${word}`

describe('the prompts', () => {
  it('draws its arrow as the code point, not as a pasted glyph', () => {
    // `select.test.ts` pins the rail's glyphs the same way and for the same
    // reason: a look-alike character pasted from somewhere else is invisible in
    // review and fails only in the font subset.
    expect(ARROW).toBe('▸')
  })

  it('is built from the constants the boot already uses', () => {
    // Not a fourth copy of `$ jukebox`. #82 wrote those two constants for the
    // line the page shows being typed, and this is the same shell and the same
    // program.
    expect(PROMPTS.binary).toBe('$ jukebox ')
    expect(PROMPTS.site).toBe(`${HOST} ${ARROW} `)
  })
})

describe('the echo', () => {
  it('writes a binary command at the binary prompt', () => {
    expect(text(run('add').echo)).toBe(`${PROMPTS.binary}add`)
  })

  it('writes a site verb at the page prompt', () => {
    expect(text(run('help').echo)).toBe(`${PROMPTS.site}help`)
  })

  it('writes a word it does not know at the page prompt', () => {
    // It belongs to neither vocabulary, and the sentence underneath is the site
    // speaking -- so the site is who echoed it.
    expect(text(run('foo').echo)).toBe(`${PROMPTS.site}foo`)
  })

  it('keeps what was typed, arguments and all', () => {
    expect(text(run('add foo').echo)).toBe(`${PROMPTS.binary}add foo`)
  })

  it('writes `help add` at the page prompt, because `help` is the page\'s word', () => {
    // The command being described is the binary's; the verb being run is not.
    // The echo answers for what was run.
    expect(text(run('help add').echo)).toBe(`${PROMPTS.site}help add`)
  })
})

describe('help', () => {
  it('lists everything typeable, and nothing else', () => {
    // The criterion, as a set rather than as a substring search. This is what
    // keeps it true when #88, #90 and #91 add verbs: a command that exists and
    // is not listed fails here, and so does a listing that names something
    // nobody can type.
    expect(new Set(landable(run('help').body))).toEqual(
      new Set(COMMANDS.map((command) => command.name)),
    )
  })

  it('covers all seven of the binary and all three of the page', () => {
    expect(COMMANDS.filter((command) => command.voice === 'binary')).toHaveLength(7)
    expect(
      COMMANDS.filter((command) => command.voice === 'site').map((command) => command.name),
    ).toEqual([
      'help',
      'install',
      'clear',
    ])
  })

  it('indents with spaces, because there is no indent field', () => {
    // `lines.ts` says there must not be one and that a horizontal offset is a
    // space inside the string. That rule arrives here with the first output
    // #82 did not write.
    const drawn = rows(run('help').body)

    expect(drawn.some((line) => line.includes('\t'))).toBe(false)
    expect(drawn).toContain(`  add      ${documented('add').summary}`)
    expect(drawn).toContain(`  version  ${documented('version').summary}`)
  })

  it('lists the binary in the binary\'s own order', () => {
    // Alphabetical, because `cli/src/root.ts` declares the tree that way and
    // `cli/test/spawned.test.ts` pins it as what `--help --json` reports. The
    // page's list is the binary's list; #87 is where it stopped being a second
    // ordering somebody chose here.
    const listed = rows(run('help').body)
      .filter((line) => line.startsWith('  '))
      .map((line) => line.trim().split(/\s{2,}/)[0])

    expect(listed.slice(0, CLI_COMMANDS.length)).toEqual(CLI_COMMANDS.map((one) => one.name))
  })

  it('keeps the name and its summary apart when read out', () => {
    // The column is built from spaces, and spaces are content here rather than
    // decoration: hide them and a screen reader is handed `addStart tracking a
    // public playlist…` Whitespace is what keeps the two readable as two, and
    // an assistive technology collapses the run on its own.
    const row = run('help').body.find((line) => text(line).startsWith('  add'))!

    expect(spoken(row)).toBe(`  add      ${documented('add').summary}`)
  })
})

describe('a word the page does not know', () => {
  it('answers the way a shell does', () => {
    // Pinned as literals, which is the one place this repo's never-retype-copy
    // rule is correctly broken: here the literal *is* the acceptance criterion,
    // and a test importing the module's own template would assert nothing.
    const printed = run('foo')

    expect(rows(printed.body)).toEqual([
      'jukebox.dev: command not found: foo',
      'Try `help`.',
    ])
  })

  it('names the word rather than the whole line', () => {
    // Lookup is on the first word, so reporting the whole buffer would name
    // something that was never looked up. A shell names the word too. The echo
    // still carries everything that was typed.
    expect(text(run('foo bar').echo)).toBe(`${PROMPTS.site}foo bar`)
    expect(text(run('foo bar').body[0]!)).toBe('jukebox.dev: command not found: foo')
  })

  it('does not read the backticks out', () => {
    expect(spoken(run('foo').body[1]!)).toBe('Try help.')
  })

  it('offers `help` as a word the cursor can land on', () => {
    expect(landable(run('foo').body)).toEqual(['help'])
  })
})

describe('a binary command', () => {
  it('prints its generated description and does not pretend to run', () => {
    // ADR-0010: the page explains, it never simulates. What it prints is the
    // command's own help, which is a description of the command.
    expect(rows(run('add').body)[0]).toBe(documented('add').summary)
  })

  it('prints the binary\'s own usage line under a heading', () => {
    // The spelling and the sentence come from the generated list; only the
    // shape around them is written here. Typing the description out would be
    // the third copy this file's header refuses.
    const url = documented('add').args[0]!

    expect(rows(run('add').body)).toEqual([
      documented('add').summary,
      '',
      'usage',
      `  ${documented('add').usage}`,
      '',
      'arguments',
      `  ${url.name}   ${url.description}`,
    ])
  })

  it('prints every argument the binary declares, for every command', () => {
    // The acceptance criterion, over all seven rather than over a sample:
    // curating the set is what would let the page's help disagree with the
    // binary's.
    for (const command of CLI_COMMANDS) {
      const drawn = rows(run(command.name).body)

      expect(drawn[0]).toBe(command.summary)
      expect(drawn).toContain(`  ${command.usage}`)

      for (const argument of command.args) {
        expect(drawn.some((line) => line.startsWith(`  ${argument.name}`))).toBe(true)
        expect(drawn.some((line) => line.endsWith(argument.description))).toBe(true)
      }
    }
  })

  it('lays its arguments out on the CLI\'s own metrics', () => {
    // Two spaces of indent and three of gutter, which is `cli/src/phrasing.ts`'s
    // `columns` and what #79 asks a table on this page to reuse. `config` is
    // the one command with two arguments of different widths, so it is the only
    // place the padding can be seen at all.
    const drawn = rows(run('config').body)
    const [key, value] = documented('config').args

    // The padding is spelled out and the copy is not, which is the split that
    // makes this test mean something: five spaces after the shorter spelling
    // and three after the longer is the whole assertion, and a description
    // typed here would be a copy no diff checks.
    expect(drawn).toContain(`  ${key!.name}     ${key!.description}`)
    expect(drawn).toContain(`  ${value!.name}   ${value!.description}`)
  })

  it('prints no arguments block for a command that takes none', () => {
    expect(rows(run('list').body)).toEqual([
      documented('list').summary,
      '',
      'usage',
      `  ${documented('list').usage}`,
    ])
  })

  it('never doubles a blank line, and never ends on one', () => {
    // `lines.ts`: every vertical gap is zero or one line, and the CLI never
    // double-spaces. Over all seven, because the block is assembled per command.
    for (const command of CLI_COMMANDS) {
      const drawn = rows(run(command.name).body)

      expect(drawn.at(-1)).not.toBe('')
      expect(drawn.some((line, at) => line === '' && drawn[at + 1] === '')).toBe(false)
    }
  })

  it('carries no trailing whitespace on any row', () => {
    // `phrasing.columns` trims each line for the reason that applies here too:
    // it is what an editor would strip and a `toBe` would then disagree about.
    for (const command of CLI_COMMANDS) {
      for (const line of rows(run(command.name).body)) {
        expect(line).toBe(line.trimEnd())
      }
    }
  })

  it('says so when it is handed an argument it cannot use', () => {
    expect(rows(run('add foo').body).at(-1)).toBe(LEFTOVERS)
  })

  it('names every word that does take one', () => {
    // The sentence used to name `help` alone and stopped being true the moment
    // #91 gave `install` an argument. It is derived now, so the next verb to
    // take one arrives in it rather than in a bug report.
    for (const command of COMMANDS.filter((one) => one.takesArgument === true)) {
      expect(LEFTOVERS).toContain(`\`${command.name}\``)
    }
  })

  it("puts a row of air between the quotation and the page's own sentence", () => {
    // The block above it is the binary's screen and this is the site speaking.
    // One row, never two -- the CLI does not double-space and neither does this.
    const drawn = rows(run('add foo').body)

    expect(drawn.at(-2)).toBe('')
    expect(drawn.at(-3)).not.toBe('')
  })

  it('reads that line out without the backticks', () => {
    expect(spoken(run('add foo').body.at(-1)!)).toBe(NO_ARGUMENTS)
  })
})

describe('help, given a command', () => {
  it('prints exactly what typing the command prints', () => {
    // Two ways to the same screen rather than two screens. `word(text, runs)`
    // was written with its second argument reserved for this, and #87 is the
    // ticket that gives a second word a meaning.
    for (const command of CLI_COMMANDS) {
      expect(rows(run(`help ${command.name}`).body)).toEqual(rows(run(command.name).body))
    }
  })

  it('describes the page\'s own verbs rather than running them', () => {
    // `help X` describes X; it does not do what X does. The distinction is
    // invisible across the binary's seven, which describe themselves when typed
    // because they never run -- and `clear` is where it shows: typing it empties
    // the scrollback, and asking about it must not.
    const clear = COMMANDS.find((one) => one.name === 'clear')!
    const printed = run('help clear')

    expect(rows(printed.body)).toEqual([clear.summary])
    expect(printed.clears).toBeUndefined()
  })

  it('answers a word it does not know the way a shell does', () => {
    // The argument is named, not the verb: `help` resolved fine and the word
    // after it did not, so that is the word a shell would report.
    expect(rows(run('help nonsense').body)).toEqual([
      'jukebox.dev: command not found: nonsense',
      'Try `help`.',
    ])
  })

  it('takes one command and says so when handed more', () => {
    const drawn = rows(run('help add sync').body)

    expect(drawn[0]).toBe(documented('add').summary)
    expect(drawn.at(-1)).toBe(LEFTOVERS)
  })
})

describe('install', () => {
  it('opens the picker and prints nothing of its own', () => {
    // The rows of the frame belong to `terminal.ts`, because that is also what
    // has to mark the question live. Two descriptions of one widget can
    // disagree; one cannot.
    const printed = run('install')

    expect(printed.body).toEqual([])
    expect(printed.opens).toBe(PICKER)
  })

  it('hands over the whole command for the system it was given', () => {
    const printed = run('install windows')

    expect(rows(printed.body)).toEqual([
      '# windows',
      `> ${commandFor('windows').command}   copy`,
      COPIED,
    ])
    expect(printed.opens).toBeUndefined()
  })

  it('copies it there and then, because naming a system is asking for it', () => {
    // The ticket asks a chosen row to copy immediately, and `terminal.ts` runs
    // a chosen row through the line a visitor could have typed -- so the two
    // are one gesture and this is where it is declared.
    const printed = run('install macos')

    expect(printed.intents).toEqual([copying('macos')])
    expect(printed.intents?.[0]?.value).toBe(commandFor('macos').command)
  })

  it('gives macos and linux the same line, and says whose it is above it', () => {
    expect(rows(run('install linux').body)).toEqual(rows(run('install macos').body))
    expect(rows(run('install macos').body)[0]).toBe('# macos · linux')
  })

  it('asks again when the word is not a system it knows', () => {
    // Naming the word rather than the verb, which is what a shell does and what
    // `help nonsense` already does one describe up. The picker follows, because
    // the useful answer to "not that one" is the list of the ones there are.
    const printed = run('install bsd')

    expect(rows(printed.body)).toEqual([unknown('bsd')])
    expect(printed.opens).toBe(PICKER)
  })

  it('puts nothing on a clipboard for a word it did not understand', () => {
    expect(run('install bsd').intents).toBeUndefined()
  })

  it('takes one system and says so when handed more', () => {
    expect(rows(run('install macos sync').body).at(-1)).toBe(LEFTOVERS)
  })

  it('describes itself when asked, rather than doing what it does', () => {
    // `help X` describes X. Across the binary's seven the distinction is
    // invisible, because those describe themselves when typed. Here it is the
    // difference between a sentence and a clipboard write.
    const printed = run('help install')

    expect(rows(printed.body)).toEqual([find('install')!.summary])
    expect(printed.opens).toBeUndefined()
    expect(printed.intents).toBeUndefined()
  })
})

describe('clear', () => {
  it('asks for the scrollback rather than printing into it', () => {
    const printed = run('clear')

    expect(printed.clears).toBe(true)
    expect(printed.body).toEqual([])
  })

  it('announces what it did, because it printed nothing to announce', () => {
    // Silence is indistinguishable from a key that never registered.
    expect(run('clear').announcement).toBe('The scrollback is empty.')
  })
})

describe('the copy rules', () => {
  it('writes the page\'s own summaries as sentences', () => {
    // #85's last criterion, kept for the half of the list the page still
    // writes.
    for (const command of COMMANDS.filter((one) => one.voice === 'site')) {
      expect(command.summary).toMatch(/^[A-Z].*\.$/)
    }
  })

  it('leaves the binary\'s summaries in the binary\'s register', () => {
    // Sentence case and no terminal full stop, which is how a `meta.description`
    // is written under `cli/src/commands/`. Adding one here would be the page
    // editing a quotation, which is the whole thing #87 removed.
    for (const command of CLI_COMMANDS) {
      expect(command.summary).toMatch(/^[A-Z]/)
      expect(command.summary).not.toMatch(/\.$/)
    }
  })

  it('writes every name as a lower-case word', () => {
    for (const command of COMMANDS) {
      expect(command.name).toBe(command.name.toLowerCase())
      expect(command.name).not.toMatch(/\s/)
    }
  })

  it('takes the binary half from the one list that owns it', () => {
    expect(COMMANDS.filter((command) => command.voice === 'binary')).toEqual(
      CLI_COMMANDS.map((command) => ({ ...command, voice: 'binary' })),
    )
  })
})
