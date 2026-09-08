import { describe, expect, it } from 'bun:test'
import { find } from '../lib/session/commands'
import { CLI_VERSION, HOST, MENU_ENTRIES, WORDMARK } from '../lib/content'
import { versionLine } from '../lib/session/header'
import { commandFor, INSTALL } from '../lib/session/install'
import { BINARY, CRLF } from '../lib/session/lines'
import { answered, greeting, reworded } from '../lib/session/shell'
import { RESTING } from '../lib/session/theme'

/**
 * The bridge between the verbs and a real shell -- #112.
 *
 * Everything this module does is compose things that already exist: `run`
 * answers one entered line, `written` turns the answer into bytes, and this
 * decides what a bash command hands back. So the tests here are about the
 * *difference* between what `run` returns and what a terminal is given, and
 * deliberately not about what `run` returns -- `commands.test.ts` owns that,
 * and a second copy of it here would be two descriptions of one answer.
 *
 * It stays pure, and `tsconfig.test.json` is what enforces it: this file
 * compiles with Bun's types and no DOM lib, so a module reaching for `document`
 * fails here rather than in review. It imports nothing from `just-bash` for the
 * same reason one step further out -- the shell library's own types are not in
 * this program, and the wiring that owns them is a component.
 */

describe('answered', () => {
  it('prints the body, and not the echo the shell already drew', () => {
    // **The one thing this function does that `run` does not.** A `Printed`
    // carries an echo because the old page drew its own prompt line; bash draws
    // that line itself, at its own prompt, before the command ever runs. Handing
    // the echo back would print the typed line twice, once by the shell and once
    // by us.
    //
    // Asserted as a difference rather than against a literal: the echo's own
    // text is what must be absent, so the test names it through the constant the
    // prompt is built from and would fail if this started passing it through.
    const { stdout } = answered('add', RESTING)

    expect(stdout).not.toContain(`${BINARY}add`)

    // And the body did arrive -- otherwise "the echo is absent" would pass on a
    // function that returned nothing at all. The summary comes off the registry
    // rather than being transcribed, because `content.ts` is generated and a
    // literal here would be a second copy of a generated string.
    expect(stdout).toContain(find('add')!.summary)
  })

  it('surfaces what has to happen off the page, and says so with a list either way', () => {
    // A clipboard write cannot be a return value, so it leaves as a declaration
    // and a component performs it. That arrangement predates the shell; what is
    // new is that nothing between here and the browser is a React event any
    // more -- bash runs the command -- so an intent dropped here is dropped
    // silently and for good.
    //
    // The expected value comes from `install.ts` rather than from the intent
    // this call produced, so the assertion crosses the module boundary instead
    // of agreeing with itself.
    const { intents } = answered(`${INSTALL} macos`, RESTING)

    // The kind and the value, and deliberately not the `what`: that string is
    // written inline in `copying` and asserting it here would only prove this
    // test can read the same file twice. `install.test.ts` owns it.
    expect(intents).toHaveLength(1)
    expect(intents[0]?.kind).toBe('copy')
    expect(intents[0]).toHaveProperty('value', commandFor('macos').command)

    // **Empty rather than absent, on the commands that declare none.** `Printed`
    // makes the field optional, so forwarding it unchanged would hand the wiring
    // an `undefined` to remember to guard -- and the one that forgets performs
    // nothing and reports nothing.
    expect(answered('add', RESTING).intents).toEqual([])
  })

  it('empties the screen for `clear`, rather than printing a row about it', () => {
    // **The one verb whose answer is not rows.** `run` says so with `clears`
    // and prints nothing, because emptying a scrollback is a change to state it
    // does not hold. On the old page a reducer performed it; here the terminal
    // does, and the only way to ask a terminal for it is to write the escape.
    //
    // The codes are transcribed from the ANSI spec rather than imported from
    // the module under test -- an escape asserted against the constant that
    // produced it agrees with whatever that constant happens to say, which is
    // the trap #111's own tests record falling into.
    const { stdout } = answered('clear', RESTING)

    expect(stdout).toContain('\x1b[2J') // erase the display
    expect(stdout).toContain('\x1b[3J') // and the scrollback behind it
    expect(stdout).toContain('\x1b[H') // cursor back to the top left

    // **And nothing else.** `written([])` is the empty string, so a trailing
    // CRLF would print one blank row into a screen whose whole answer is that
    // there is nothing on it -- the one command whose point is a blank screen
    // cannot be the one command that always writes a row.
    expect(stdout).not.toContain(CRLF)
  })
})

describe('reworded', () => {
  it('says what this page says when a word is not a command', () => {
    // **The shell resolves; this only changes the wording.** Real bash calls
    // `command_not_found_handle` for exactly this and `just-bash` has no such
    // hook, so the rewrite happens on the stream instead -- which is the whole
    // of the difference, and why lookup is still bash's and not ours.
    //
    // The input is transcribed from `just-bash`'s own message, with the CRLF the
    // adapter converts its newline into. Both halves are quoted from somewhere
    // else rather than built here, so this fails if either changes.
    const rewritten = reworded('bash: nonsense: command not found\r\n')

    expect(rewritten).toContain(`${HOST}: command not found: nonsense`)
    expect(rewritten).toContain('help')
    expect(rewritten).not.toContain('bash:')
  })

  it('leaves every other byte exactly as it found it', () => {
    // **This runs in front of the whole stream**, so it is not enough that it
    // rewrites the right line -- it has to be invisible on every line it is not
    // about. A version built out of splitting and rejoining passes the case
    // above and quietly restyles everything else, which on a screen made of
    // escape sequences means colour bleeding between rows.
    //
    // The sample is real output rather than a string written here, because what
    // has to survive is the attributes: `written` brackets every span, and those
    // are the bytes a careless rewrite eats.
    const untouched = answered('add', RESTING).stdout

    expect(reworded(untouched)).toBe(untouched)

    // And the words on their own are not the message. `help` prints the phrase
    // in prose the moment a command is described as not being found, and a
    // match loose enough to catch that would rewrite the page's own sentence
    // into itself.
    expect(reworded('command not found\r\n')).toBe('command not found\r\n')
  })
})

/**
 * Any Block Element -- the range the mark is drawn entirely out of, and the one
 * `@wterm/dom` intercepts and paints as a gradient rather than asking the font
 * for. Matching the range rather than one glyph, so a regenerated banner that
 * reaches for a different shade of block still counts as art.
 */
const BLOCKS = /[▀-▟]/u

/** The art's own width, measured rather than transcribed. */
const NATURAL = Math.max(...WORDMARK.split('\n').map((line) => [...line].length))

describe('greeting', () => {
  it('shows the mark at its own width, and a version line one column short of it', () => {
    // **The threshold is the art, not a number.** The emulator derives its
    // columns by measuring a character and dividing the container, so a grid
    // narrower than the mark wraps all five rows into noise. `cli/src/header.ts`
    // answers the same question with `NATURAL`, and the two agree because both
    // measure the banner rather than remembering it.
    //
    // Asserted at the boundary and one column below it, because that pair is
    // what a hardcoded 67 and a measured 67 disagree about the day the banner
    // is regenerated wider.
    expect(BLOCKS.test(greeting(CLI_VERSION, NATURAL))).toBe(true)
    expect(BLOCKS.test(greeting(CLI_VERSION, NATURAL - 1))).toBe(false)
  })

  it('says which binary it is either way, and offers the same five things', () => {
    // The version line is a fact rather than a task, so it survives the art
    // going: below the threshold it *is* the header. Above it, it sits under the
    // mark exactly as the binary prints it.
    for (const columns of [NATURAL, NATURAL - 1]) {
      const written = greeting(CLI_VERSION, columns)

      expect(written).toContain(versionLine(CLI_VERSION))

      // The menu is text now rather than a select, and every entry has to be
      // there to be typed. Read off `MENU_ENTRIES` so a sixth arrives here
      // without anybody writing it down twice.
      for (const entry of MENU_ENTRIES) expect(written).toContain(entry.label)
    }
  })

  it('joins its rows rather than terminating them, because the adapter does that', () => {
    // `BashShell.attach` writes `greeting + CRLF` and then draws its prompt, so
    // a greeting that ended in one would put a row on screen nothing in the
    // composition asked for. The gap above the prompt is a `blank()` in the list
    // instead -- spacing somebody chose rather than spacing that happened.
    //
    // Pinned because the two are indistinguishable by eye on a rendered page,
    // and the wrong one only shows up as the page slowly growing a margin.
    //
    // Stated as *one* blank row rather than none: the composition ends with a
    // `blank()`, so the joined string ends with a separator and nothing after
    // it, which is what a single empty row looks like. Two would mean the
    // terminator was added twice.
    const rows = greeting(CLI_VERSION, NATURAL).split(CRLF)

    expect(rows.at(-1)).toBe('')
    expect(rows.at(-2)).not.toBe('')
  })
})
