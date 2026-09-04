import { CLI_COMMANDS, HOST } from '../content'
import {
  blank,
  decoration,
  dim,
  ink,
  PROMPT,
  prose,
  row,
  TYPED,
  word,
  type Line,
} from './lines'

/**
 * What can be typed, and whose word it is.
 *
 * ADR-0010 makes the second half a rule rather than a flourish: *the binary's
 * vocabulary and the site's are never dressed as each other.* Commands the
 * binary owns sit at a `$ jukebox …` prompt, verbs only the page has sit at
 * `jukebox.dev ▸`, and `voice` below is the whole of how the echo knows which
 * to write. A visitor types both at the one live prompt and the prompt they are
 * echoed at is what teaches the split, without a word of explanation.
 *
 * The other half of that ADR governs everything printed here: *the page
 * explains; it never simulates.* A binary command answers with a description of
 * itself and never with output it did not produce. #90's recording is the only
 * place on this page where fabricated output is allowed to appear.
 */

/** The page's own prompt mark. Pinned as a code point in the tests, and in `check-fonts.ts`. */
export const ARROW = '▸'

export type Voice = 'binary' | 'site'

export type Command = {
  readonly name: string
  readonly summary: string
  readonly voice: Voice
}

/**
 * The two prompts, built from the constants the boot already uses.
 *
 * Not a fourth copy of `$ jukebox`: #82 wrote `PROMPT` and `TYPED` for the line
 * the page shows being typed, and this is the same shell and the same program,
 * so a page that spelled them again here could disagree with its own first
 * screen.
 *
 * Both end in a space, so an echo is a prefix and what was typed, joined with
 * nothing. That is also why the whole prefix is `decoration` when it is drawn:
 * `$ jukebox ` is the frame the page puts around a word, not something the
 * visitor wrote, and a screen reader reading the transcript wants the word.
 */
export const PROMPTS: Readonly<Record<Voice, string>> = {
  binary: `${PROMPT} ${TYPED} `,
  site: `${HOST} ${ARROW} `,
}

/**
 * The page's own verbs. Two today.
 *
 * #88 adds `donate` and `theme`, #90 adds `demo`, #91 adds `install` -- each
 * one entry here and one branch in `run` below. They are deliberately not in
 * `MENU_ENTRIES`: the menu carries the binary's five and nothing else, because
 * putting a site verb there would be the site speaking in the binary's voice.
 */
const VERBS: readonly Command[] = [
  { name: 'help', summary: 'List everything you can type.', voice: 'site' },
  { name: 'clear', summary: 'Empty the scrollback.', voice: 'site' },
]

/**
 * Everything typeable, which is what `help` is required to list.
 *
 * The binary half is `CLI_COMMANDS` rather than a list written here, so there
 * is one place a command's description lives on this side and #87 has one file
 * to generate. The `voice` is added here rather than stored there because it is
 * a fact about this page's vocabulary split, and `content.ts` should not have
 * to know that the split exists.
 */
export const COMMANDS: readonly Command[] = [
  ...CLI_COMMANDS.map((command) => ({ ...command, voice: 'binary' as const })),
  ...VERBS,
]

export const find = (name: string): Command | undefined =>
  COMMANDS.find((command) => command.name === name)

/**
 * What one entered line puts on the screen.
 *
 * `echo` is separate from `body` because the two are announced differently: the
 * visitor typed the echo and does not need it read back, so only the body
 * reaches the live region.
 *
 * `announcement` is for the command whose body cannot speak for itself, which
 * today is `clear` alone -- it prints nothing, and silence is indistinguishable
 * from a key that never registered. Everything else derives its announcement
 * from what it printed.
 *
 * `clears` is a request rather than an action, for the reason the whole module
 * exists: emptying the scrollback is a change to state this module does not
 * hold. `terminal.ts` owns the scrollback and performs it.
 *
 * **Nothing here can open a select, and #91 is the ticket that adds it.** The
 * widget and every transition it needs landed with #86 and are reusable as they
 * stand -- `test/terminal.test.ts` drives a picker-shaped question through the
 * whole reducer -- but the page has no command that opens one, so the request
 * that would carry it is not written. It is the shape `clears` above already
 * has: one more optional field here, read where `terminal.ts` reads that one.
 * Written the other way round it would be a field with no consumer, which is
 * the reservation this repo deletes rather than keeps.
 */
export type Printed = {
  readonly echo: Line
  readonly body: readonly Line[]
  readonly announcement?: string
  readonly clears?: true
}

/** Said when `clear` has left nothing behind to say. */
export const EMPTIED = 'The scrollback is empty.'

/** Said when a word was recognised and the rest of the line could not be used. */
export const NO_ARGUMENTS = 'This page takes no arguments.'

const echoed = (voice: Voice, typed: string): Line =>
  row(decoration(PROMPTS[voice]), ink(typed))

/**
 * The width of the name column in `help`, measured rather than chosen.
 *
 * Two spaces clear of the longest name, so the summaries line up and adding a
 * verb cannot leave the column too narrow for it. `version` is the longest
 * today; #88, #90 and #91 all add shorter ones, so this is stable in practice
 * and correct regardless.
 */
const COLUMN = Math.max(...COMMANDS.map((command) => command.name.length)) + 2

/**
 * One section of the listing.
 *
 * The indent and the padding are plain spaces rather than `decoration`, and the
 * distinction matters: decoration is hidden from assistive technology, and a
 * hidden column of spaces would hand a screen reader `addTrack a playlist.`
 * Whitespace here is what keeps the two readable as two, and an assistive
 * technology collapses the run on its own.
 *
 * Summaries are `dim` because that is what a second column is, and because
 * `select.ts` already draws the menu's hints that way -- so when #87 swaps
 * these for the CLI's generated help the page does not change typeface.
 */
const section = (heading: string, commands: readonly Command[]): Line[] => [
  row(prose(heading)),
  ...commands.map((command) =>
    row(
      dim('  '),
      word(command.name),
      dim(' '.repeat(COLUMN - command.name.length)),
      dim(command.summary),
    ),
  ),
]

const listing = (): Line[] => [
  ...section("The binary's commands.", COMMANDS.filter((command) => command.voice === 'binary')),
  blank(),
  ...section("The page's own verbs.", COMMANDS.filter((command) => command.voice === 'site')),
]

/**
 * What a shell says, said the way a shell says it.
 *
 * Flat, with no joke and no scolding. The backticks are decoration so that the
 * printed row reads ``Try `help`.`` and the spoken one reads `Try help.` --
 * nobody should hear punctuation the page added for a sighted reader. The
 * `help` between them is a word the cursor can land on, which costs one
 * constructor call and saves the visitor typing it.
 */
const notFound = (typed: string): Line[] => [
  row(ink(`${HOST}: command not found: ${typed}`)),
  row(prose('Try '), decoration('`'), word('help'), decoration('`'), prose('.')),
]

/**
 * One entered line, answered.
 *
 * Lookup is on the first word, so `add foo` finds `add`. Nothing on this page
 * takes an argument yet, and the leftovers earn a plain line rather than
 * silence: discarding part of what somebody typed without saying so is the one
 * habit this project's copy consistently refuses. #87 and #91 are the tickets
 * that give arguments a meaning, and that line goes when they do.
 */
export const run = (buffer: string): Printed => {
  const typed = buffer.trim()
  const [name = '', ...rest] = typed.split(/\s+/)
  const command = find(name)

  // The word, not the line. Lookup is on the first word, so naming the whole
  // buffer would report something that was never looked up -- and a shell names
  // the word too. The echo above still shows everything that was typed.
  if (command === undefined) {
    return { echo: echoed('site', typed), body: notFound(name) }
  }

  const echo = echoed(command.voice, typed)

  // Nothing is printed into a scrollback that is about to be emptied, the
  // leftovers of `clear foo` included -- the screen going blank is the answer.
  if (command.name === 'clear') return { echo, body: [], clears: true, announcement: EMPTIED }

  const extra = rest.length > 0 ? [row(prose(NO_ARGUMENTS))] : []
  const body = command.name === 'help' ? listing() : [row(ink(command.summary))]

  return { echo, body: [...body, ...extra] }
}
