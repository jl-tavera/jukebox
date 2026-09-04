import { describe, expect, it } from 'bun:test'
import { CLI_COMMANDS, HOST } from '../lib/content'
import { ARROW, COMMANDS, PROMPTS, run } from '../lib/session/commands'
import { spoken, text, type Line } from '../lib/session/lines'

/**
 * What the page answers, and in whose voice.
 *
 * ADR-0010 makes the voice a rule rather than a flourish -- the binary's
 * vocabulary and the site's are never dressed as each other -- so the echo is
 * asserted through `PROMPTS` rather than against a retyped string. The one
 * exception is the not-found copy, which #85 pins by hand and which is
 * explained where it is asserted.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

/** Every word on these lines the cursor can land on, by what it would run. */
const landable = (lines: readonly Line[]): string[] =>
  lines
    .flatMap((line) => (line.kind === 'text' ? line.spans : []))
    .flatMap((span) => (span.runs === undefined ? [] : [span.runs]))

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

  it('covers all seven of the binary and both of the page', () => {
    expect(COMMANDS.filter((command) => command.voice === 'binary')).toHaveLength(7)
    expect(
      COMMANDS.filter((command) => command.voice === 'site').map((command) => command.name),
    ).toEqual([
      'help',
      'clear',
    ])
  })

  it('indents with spaces, because there is no indent field', () => {
    // `lines.ts` says there must not be one and that a horizontal offset is a
    // space inside the string. That rule arrives here with the first output
    // #82 did not write.
    const drawn = rows(run('help').body)

    expect(drawn.some((line) => line.includes('\t'))).toBe(false)
    expect(drawn).toContain('  add      Track a playlist.')
    expect(drawn).toContain('  version  Report the version of Jukebox you are running.')
  })

  it('keeps the name and its summary apart when read out', () => {
    // The column is built from spaces, and spaces are content here rather than
    // decoration: hide them and a screen reader is handed `addTrack a
    // playlist.` Whitespace is what keeps the two readable as two, and an
    // assistive technology collapses the run on its own.
    const row = run('help').body.find((line) => text(line).startsWith('  add'))!

    expect(spoken(row)).toMatch(/^\s+add\s+Track a playlist\.$/)
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
  it('describes itself and does not pretend to run', () => {
    // ADR-0010: the page explains, it never simulates. A summary is a
    // description of the command, which is what a help line is.
    expect(rows(run('add').body)).toEqual(['Track a playlist.'])
  })

  it('says so when it is handed an argument it cannot use', () => {
    expect(rows(run('add foo').body)).toEqual([
      'Track a playlist.',
      'This page takes no arguments.',
    ])
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
  it('writes every summary as a sentence', () => {
    // #85's last criterion, as a test rather than a review note.
    for (const command of COMMANDS) {
      expect(command.summary).toMatch(/^[A-Z].*\.$/)
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
