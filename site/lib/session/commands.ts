import { CLI_COMMANDS, HOST, type CliArgument } from '../content'
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
  /**
   * The binary's own usage line and arguments, for the commands that have one.
   *
   * Absent on the page's own verbs, and absent rather than empty: `help` has no
   * usage line the binary would print, and an empty string here would be a
   * quotation of nothing. `helped` below reads the absence and prints the
   * summary on its own instead.
   */
  readonly usage?: string
  readonly args?: readonly CliArgument[]
  /**
   * Whether the word after this one means something.
   *
   * `help` alone today, and it is what `terminal.ts` reads to decide whether
   * completing this name should leave a trailing space under the caret. #91's
   * `install` is the next one, and this is a field rather than a literal
   * `'help'` over there so that it can set its own.
   */
  readonly takesArgument?: true
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
  { name: 'help', summary: 'List everything you can type.', voice: 'site', takesArgument: true },
  { name: 'clear', summary: 'Empty the scrollback.', voice: 'site' },
]

/**
 * Everything typeable, which is what `help` is required to list.
 *
 * The binary half is `CLI_COMMANDS` rather than a list written here, so there
 * is one place a command's description lives on this side and #87 had one file
 * to generate into. The `voice` is added here rather than stored there because it is
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

/**
 * Said when a word was recognised and the rest of the line could not be used.
 *
 * The spoken form, which is what a screen reader is handed. `noArguments` below
 * puts `help` between backticks the way `notFound` does, so the printed row
 * reads ``Only `help` takes an argument here.`` and this is what is heard.
 *
 * It named the page until #87 -- "this page takes no arguments" -- and that
 * stopped being true the moment `help add` did something. Naming the one word
 * that does take one is also the more useful sentence: somebody who has just
 * put an argument somewhere it does not go is being shown where one goes.
 */
export const NO_ARGUMENTS = 'Only help takes an argument here.'

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
 * `select.ts` already draws the menu's hints that way -- so when #87 swapped
 * these for the CLI's generated help the page did not change typeface.
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
 * Two spaces of indent and three of gutter, which is `cli/src/phrasing.ts`'s
 * `columns` -- the metrics #79 asks a table on this page to reuse rather than
 * invent. The listing above keeps its own narrower column, which #85 set.
 */
const INDENT = '  '
const GUTTER = '   '

/**
 * The binary's own help for one command.
 *
 * **The structure is citty's and the typography is not.** A description, a usage
 * line, then the arguments, because that is the screen being quoted -- but citty
 * sets its headings bold, underlined and shouting, and this page has one text
 * size and a five-step ladder with no size change anywhere in it. #86 made the
 * same trade for the menu's rail and gave the reason: the shape is what
 * identifies the widget, and the library's decoration is the library's rather
 * than this project's. So the headings are lower case and `dim`, which is this
 * page's register for a label, and what sits under them is `ink`.
 *
 * A verb of the page's own has no `usage`, and gets its summary alone. That is
 * not a missing case: `help` and `clear` are not commands the binary would
 * print a usage line for, and inventing one would be the page quoting a screen
 * that does not exist.
 *
 * The padding is `dim` rather than `decoration` for `section`'s reason: a
 * hidden column of spaces hands a screen reader two columns run into one.
 */
const helped = (command: Command): Line[] => {
  const body: Line[] = [row(ink(command.summary))]

  if (command.usage === undefined) return body

  body.push(blank(), row(dim('usage')), row(dim(INDENT), ink(command.usage)))

  const args = command.args ?? []
  if (args.length === 0) return body

  const width = Math.max(...args.map((argument) => argument.name.length))

  body.push(
    blank(),
    row(dim('arguments')),
    ...args.map((argument) =>
      row(
        dim(INDENT),
        ink(argument.name),
        dim(' '.repeat(width - argument.name.length) + GUTTER),
        dim(argument.description),
      ),
    ),
  )

  return body
}

/**
 * The leftovers of a line, said rather than dropped.
 *
 * `notFound`'s shape and for its reason: the backticks are decoration so the
 * printed row carries them and the spoken one does not, and the `help` between
 * them is a word the cursor can land on.
 */
const noArguments = (): Line[] => [
  // A row of air above it, because what is above it is a quotation of the
  // binary's screen and this is the page talking. The faces already differ;
  // running a prose sentence straight onto the last row of an arguments table
  // reads as though it were one more argument.
  blank(),
  row(
    prose('Only '),
    decoration('`'),
    word('help'),
    decoration('`'),
    prose(' takes an argument here.'),
  ),
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
 * Lookup is on the first word, so `add foo` finds `add`. The leftovers earn a
 * line rather than silence: discarding part of what somebody typed without
 * saying so is the one habit this project's copy consistently refuses.
 *
 * **`help` is the one word here a second word means something after**, and #87
 * is where that started. Everything else on this page still answers about
 * itself and nothing else, which is what keeps `add https://…` from looking
 * like a page that might be about to add something.
 *
 * `help X` **describes** X; it does not do what X does. Across the binary's
 * seven the distinction is invisible, because those describe themselves when
 * typed -- they never run here. `clear` is where it shows: typing it empties
 * the scrollback and asking about it prints a sentence.
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

  if (command.name === 'help') {
    const [about, ...spare] = rest

    if (about === undefined) return { echo, body: listing() }

    // The argument, not the verb. `help` resolved and the word after it did
    // not, so that is the word a shell would name -- and naming `help` here
    // would report the one thing that worked.
    const asked = find(about)
    if (asked === undefined) return { echo, body: notFound(about) }

    return { echo, body: [...helped(asked), ...(spare.length > 0 ? noArguments() : [])] }
  }

  return { echo, body: [...helped(command), ...(rest.length > 0 ? noArguments() : [])] }
}
