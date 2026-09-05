import { CLI_COMMANDS, HOST, type CliArgument } from '../content'
import { type Frame } from './boot'
import { DEMO, playing, recording } from './demo'
import { DONATE, giving } from './donate'
import { copying, INSTALL, isSystem, offering, PICKER, SYSTEMS } from './install'
import {
  BINARY,
  blank,
  chip,
  decoration,
  dim,
  GUTTER,
  INDENT,
  ink,
  prose,
  row,
  word,
  type Intent,
  type Landing,
  type Line,
  type Open,
  type Span,
} from './lines'
import {
  choosing,
  isTheme,
  naming,
  reporting,
  THEME,
  THEMES,
  type Preference,
} from './theme'

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
   * Read in two places and written down in neither: `terminal.ts` asks it to
   * decide whether completing this name should leave a trailing space under the
   * caret, and `noArguments` below asks it to name the words that take one. A
   * field rather than a literal `'help'` over there, which is what let #91's
   * verb arrive already handled -- and what stops that sentence going stale the
   * way it did.
   */
  readonly takesArgument?: true

  /**
   * The words that may follow, when they are a fixed list.
   *
   * **Absent means *a command name*,** which is what `help` takes and what Tab
   * has always filled a second word in from. It is written down now because
   * #88 made the old behaviour reachable: every second word was completed
   * against the command registry, so `theme l` completed to `theme list` --
   * `list` being a command, and `light` being in no list this module could
   * see. `install v` had the same shape from the day it landed and survived
   * only because nobody types it.
   */
  readonly takes?: readonly string[]
}

/**
 * The two prompts, built from the constants the boot already uses.
 *
 * Not a fourth copy of `$ jukebox`: #82 wrote `PROMPT` and `TYPED` for the line
 * the page shows being typed, and this is the same shell and the same program,
 * so a page that spelled them again here could disagree with its own first
 * screen. Since #90 the binary half is `BINARY` from `lines.ts` rather than
 * composed here, and the move is that sentence enforcing itself: the recording
 * writes four command lines at the same prompt, and this file imports the
 * module that draws them -- so a copy over there would have been the fifth, and
 * an import back would have been a cycle.
 *
 * Both end in a space, so an echo is a prefix and what was typed, joined with
 * nothing. That is also why the whole prefix is `decoration` when it is drawn:
 * `$ jukebox ` is the frame the page puts around a word, not something the
 * visitor wrote, and a screen reader reading the transcript wants the word.
 */
export const PROMPTS: Readonly<Record<Voice, string>> = {
  binary: BINARY,
  site: `${HOST} ${ARROW} `,
}

/**
 * The page's own verbs. Six, which is all of them.
 *
 * #90 added `demo` -- one entry here and one branch in `run` below, which is
 * what #91's `install` cost and what #88's two cost after it, and the estimate
 * this docblock made of it held. ADR-0010 names the six, and with `demo` landed
 * the list is closed rather than merely current. They are deliberately not in
 * `MENU_ENTRIES`: the menu carries the binary's five and nothing else, because
 * putting a site verb there would be the site speaking in the binary's voice.
 *
 * The order is the order `help` lists them in, and it is not alphabetical:
 * `help` first, because it is how somebody arrives at the rest; then what the
 * page can actually do; then `clear`, which is the way out of a screen rather
 * than a thing to do on one.
 *
 * **`theme` is the entry that has to be here rather than anywhere else.**
 * ADR-0010 deleted the corner toggle and left this list and #89's chip row as
 * the whole of how a visitor finds out the control exists -- so a `theme` that
 * `help` does not list is a theme control nobody can reach.
 *
 * Since #89 that is two consequences rather than one. `CHIPS` below is this
 * list, so a verb added here arrives on the status line without anybody
 * writing it down twice -- and a verb *removed* here leaves the row as well as
 * the listing, which for `theme` would be the control disappearing outright.
 */
const VERBS: readonly Command[] = [
  { name: 'help', summary: 'List everything you can type.', voice: 'site', takesArgument: true },
  {
    name: INSTALL,
    summary: 'Copy the install command for your system.',
    voice: 'site',
    takesArgument: true,
    takes: SYSTEMS,
  },
  { name: DONATE, summary: 'Every wallet address, and a control that copies one.', voice: 'site' },
  {
    name: THEME,
    summary: 'Move between light, dark and following your system.',
    voice: 'site',
    takesArgument: true,
    takes: THEMES,
  },
  // **Not `a real session`, though that is #90's own phrase for it.** The
  // ticket is describing the feature; this is copy a visitor reads, and
  // `SITE.md` 04 forbids a claim the product cannot currently support. The
  // recording prints a tier no build of `jukebox show` prints yet, so `real`
  // would be the one word on the row that is not true. What makes the exemption
  // sound is the labelling, and the label says the honest thing already.
  { name: DEMO, summary: 'Play a recording of a session.', voice: 'site' },
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
 * Everything spoken in one of the two voices.
 *
 * Written once because three callers ask it: `listing` draws a section per
 * voice, and `CHIPS` below is the site's half on its own. It was the same
 * predicate inline twice before #89 was about to make it three, which is three
 * places for one rule to stop agreeing.
 */
const voiced = (voice: Voice): readonly Command[] =>
  COMMANDS.filter((command) => command.voice === voice)

/**
 * The status line -- #89.
 *
 * **Every verb the page owns, and nothing the binary owns, by construction
 * rather than by review.** That is the whole of the ticket's rule about the
 * row, and deriving it from `voiced` is what makes it unfalsifiable here: a
 * binary command cannot reach the status line without first claiming to be one
 * of the page's own, which is a change somebody would have to make in `VERBS`
 * on purpose.
 *
 * It is `ARGUED`'s arrangement one screen down and for its reason: a list
 * written out here would be a second copy of `VERBS`, and a second copy is
 * what goes stale. #90's `demo` arrives on this row by adding one entry to
 * `VERBS`, and nothing else.
 *
 * Spans rather than names, because the module is what decides how a chip is
 * drawn -- the same landable word as everything else on the page, in the voice
 * the page speaks in. `components/chips.tsx` renders them and chooses nothing.
 */
export const CHIPS: readonly Landing[] = voiced('site').map((command) => chip(command.name))

/** Everything typeable as a first word, which is also what `help` takes as a second. */
export const NAMES: readonly string[] = COMMANDS.map((command) => command.name)

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
 * `opens` and `intents` are #91's, and both are requests for `clears`' reason:
 * this module computes, and acting is somebody else's job. **`opens` carries
 * the question rather than the rows of it**, because `terminal.ts` has to mark
 * the select live as well as draw it, and two descriptions of one widget can
 * disagree where one cannot. `intents` is what has to happen off the page -- a
 * clipboard write, today -- and the component is what performs it.
 *
 * `plays` is #90's and is a request for the same reason again: `body` is what
 * the command printed and this is the order the rows of it arrive in, which is
 * a thing that happens over time and so not this module's to perform.
 *
 * **Its frames are relative to `body` rather than to the page**, because this
 * module does not know what is above them -- `terminal.ts` holds the scrollback
 * and prefixes it. That is also what lets the last frame hand back the very
 * array the session ends up holding, which is the property `test/boot.test.ts`
 * pins for the boot with `toBe` and `test/demo.test.ts` now pins for this.
 *
 * **Whether it is honoured is not decided here.** A visitor who asked for
 * reduced motion is handed `body` whole and no frames are stepped, and the
 * media query behind that is a fact about a browser -- so `terminal.ts` reads
 * it off the state the component put there, exactly as `preference` arrives.
 * This module answers the same way for everyone.
 */
export type Printed = {
  readonly echo: Line
  readonly body: readonly Line[]
  readonly announcement?: string
  readonly clears?: true
  readonly opens?: Open
  readonly intents?: readonly Intent[]
  readonly plays?: readonly Frame[]
}

/** Said when `clear` has left nothing behind to say. */
export const EMPTIED = 'The scrollback is empty.'

/**
 * Every word on this page a second word means something after.
 *
 * Read off the field rather than written down, and #91 is why. The sentence
 * below named `help` alone, which was true for exactly as long as `help` was
 * the only verb taking an argument -- and a sentence a later ticket silently
 * makes false is worse than one that is merely longer.
 */
const ARGUED: readonly Command[] = COMMANDS.filter((command) => command.takesArgument === true)

/**
 * What joins them, and the grammar around them.
 *
 * **The comma branch is back, and the note that deleted it is why it can
 * be.** It was cut as unreachable -- two words are joined by `and` and take an
 * argument between them -- and it said what would happen when a third arrived:
 * the sentence would read `a and b and c`, *clumsy and true*. #88's `theme` is
 * that third, so the branch is reachable now and a test reaches it. `select.ts`
 * still refuses the same thing one file over, and for the same reason: nothing
 * on this page can express a disabled row, so nothing draws one.
 *
 * The names stay derived, which is the part that went stale before. A page down
 * to one verb taking an argument would need `takes` back; that is an edit to
 * one line, and it cannot be a lie in the meantime.
 */
const NEXT = ', '
const LAST = ' and '

/** Nothing before the first, `and` before the last, a comma before the rest. */
const between = (index: number, count: number): string =>
  index === 0 ? '' : index === count - 1 ? LAST : NEXT

/**
 * Said when a word was recognised and the rest of the line could not be used.
 *
 * The spoken form, which is what a screen reader is handed. `noArguments` below
 * puts each name between backticks the way `notFound` does, so the printed row
 * reads ``Only `help` and `install` take an argument here.`` and this is what
 * is heard.
 *
 * It named the page until #87 -- "this page takes no arguments" -- and that
 * stopped being true the moment `help add` did something. Naming the words that
 * do take one is also the more useful sentence: somebody who has just put an
 * argument somewhere it does not go is being shown where one goes.
 */
export const NO_ARGUMENTS = `Only ${ARGUED.map(
  (command, index) => `${between(index, ARGUED.length)}${command.name}`,
).join('')} take an argument here.`

const echoed = (voice: Voice, typed: string): Line =>
  row(decoration(PROMPTS[voice]), ink(typed))

/**
 * The width of the name column in `help`, measured rather than chosen.
 *
 * Two spaces clear of the longest name, so the summaries line up and adding a
 * verb cannot leave the column too narrow for it. `version` is the longest
 * today; #91's `install` and #88's two are shorter and #90's `demo` will be,
 * so this is stable in practice and correct regardless.
 *
 * Deliberately narrower than the `GUTTER` the tables below line up on, and
 * #85 is where that was set: this is a name against prose about it, where an
 * arguments table is a name against a value.
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
  ...section("The binary's commands.", voiced('binary')),
  blank(),
  ...section("The page's own verbs.", voiced('site')),
]

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
    ...ARGUED.flatMap((command, index): Span[] => [
      ...(index === 0 ? [] : [prose(between(index, ARGUED.length))]),
      decoration('`'),
      word(command.name),
      decoration('`'),
    ]),
    prose(' take an argument here.'),
  ),
]

/**
 * Said once a command is on the clipboard.
 *
 * A claim rather than an instruction, because the copy has already happened by
 * the time this is read -- `terminal.ts` hands the intent over and
 * `components/live.tsx` performs it in the same commit that prints this row.
 * The control beside the command is what makes the claim recoverable if a
 * browser refused it.
 *
 * Prose, and set in the human's face: the two rows above it are a thing to
 * paste, and this is the page saying what it just did with them.
 */
const COPIED = 'Copied. Paste it into a terminal.'

/**
 * Said when the word after `install` is not one of the three.
 *
 * `notFound`'s shape without its second row, because the picker that follows is
 * the pointer -- the useful answer to *not that one* is the list of the ones
 * there are, and #91 asks for the same widget either way. The word is named
 * rather than the verb, which is what a shell does and what `help nonsense`
 * already does: `install` resolved, and the thing after it did not.
 */
const unknownSystem = (word: string): Line[] => [row(ink(`${HOST}: no install command for ${word}`))]

/**
 * Said when the word after `theme` is not one of the three.
 *
 * `unknownSystem`'s shape and its reason, one verb over: the word is named
 * rather than the verb, because `theme` resolved and the thing after it did
 * not -- and the listing that follows is the pointer, since the useful answer
 * to *not that one* is the list of the ones there are. ADR-0010 puts named
 * schemes out of scope by name, so `theme nord` is a permanent answer rather
 * than a gap somebody will fill.
 */
const unknownTheme = (word: string): Line[] => [row(ink(`${HOST}: no theme called ${word}`))]

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
 * **A second word means something after the verbs carrying `takesArgument`**,
 * and #87 is where that started. Everything else on this page still answers
 * about itself and nothing else, which is what keeps `add https://…` from
 * looking like a page that might be about to add something.
 *
 * `help X` **describes** X; it does not do what X does. Across the binary's
 * seven the distinction is invisible, because those describe themselves when
 * typed -- they never run here. `clear` is where it shows: typing it empties
 * the scrollback and asking about it prints a sentence.
 */
export const run = (buffer: string, preference: Preference): Printed => {
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

  // **The only branch on this page that asks a question back.** Bare, it prints
  // nothing and hands the select over instead; `terminal.ts` draws it, because
  // it is also what marks the question live.
  //
  // Given a system it prints the offer -- the same two rows the boot puts on
  // screen unasked, from the same function -- and declares the copy. That the
  // copy happens here rather than at the widget is what keeps a chosen row and
  // a typed line one gesture: `picked` runs a row by entering what the row
  // carries, so there is no second path to disagree with this one.
  if (command.name === INSTALL) {
    const [system, ...spare] = rest

    if (system === undefined) return { echo, body: [], opens: PICKER }
    if (!isSystem(system)) return { echo, body: unknownSystem(system), opens: PICKER }

    return {
      echo,
      body: [...offering(system), row(prose(COPIED)), ...(spare.length > 0 ? noArguments() : [])],
      intents: [copying(system)],
    }
  }

  // The rows, and no intent among them. Every declared intent is performed the
  // moment it reaches the component, so four of them would put four addresses
  // on a clipboard for the act of printing the block. The controls live on the
  // rows and fire when one is used, which is what `Span.copies` is for -- and
  // a row that is not configured carries none, so there is nothing on this
  // page that can put a placeholder on a clipboard.
  if (command.name === DONATE) {
    return { echo, body: [...giving(), ...(rest.length > 0 ? noArguments() : [])] }
  }

  // **The only branch that asks the browser to change something about
  // itself.** `next-themes` owns the theme, so what leaves here is the request
  // and `components/live.tsx` performs it -- the arrangement `install` has
  // with a clipboard, one field of `Intent` over.
  //
  // Bare, it reports and lists, which is what replaces a control a visitor
  // could see. Given a theme it reports **the one it was just handed** rather
  // than the one this module is holding: the round trip through the provider
  // has not happened yet, and the system underneath is unmoved by the choice,
  // so the two halves of the sentence come from the two places that know.
  if (command.name === THEME) {
    const [chosen, ...spare] = rest

    if (chosen === undefined) return { echo, body: [reporting(preference), blank(), ...naming()] }
    if (!isTheme(chosen)) return { echo, body: [...unknownTheme(chosen), blank(), ...naming()] }

    return {
      echo,
      body: [
        reporting({ theme: chosen, system: preference.system }),
        ...(spare.length > 0 ? noArguments() : []),
      ],
      intents: [choosing(chosen)],
    }
  }

  // **The only branch on this page that prints output the binary did not
  // produce**, and the one ADR-0010 carves out by name: nothing invents a
  // Resolution, a Tier or a Track count *outside one labelled recording*. The
  // label rows are inside `recording()` rather than added here, so the thing
  // that says "this is a recording" cannot be separated from the recording.
  //
  // The body and the frames come from the same script, so what a visitor who
  // asked for reduced motion is handed whole and what everybody else watches
  // arrive are the same rows in the same order -- one description rather than
  // two that can disagree.
  //
  // The leftovers go through `playing` rather than being appended after it, so
  // the frames cover the whole body. Left out they were in `body` and in no
  // frame at all, and the sentence arrived only when the last frame handed the
  // session back -- a row that pops in at the end is a row that was never
  // played, and the two halves of a `Printed` disagreed for the whole playback.
  if (command.name === DEMO) {
    const spare = rest.length > 0 ? noArguments() : []

    return { echo, body: [...recording(), ...spare], plays: playing(spare) }
  }

  return { echo, body: [...helped(command), ...(rest.length > 0 ? noArguments() : [])] }
}
