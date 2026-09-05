import { CLI_VERSION } from '../content'
import { replay, type Frame } from './boot'
import { find, NAMES, run } from './commands'
import { finished } from './index'
import { guessed } from './install'
import { blank, spoken, type Copying, type Line, type Open, type Session } from './lines'
import { RESTING, type Preference } from './theme'
import { abandoned, active, answered, asking, height, moved, named } from './select'

/**
 * The live prompt, as a pure function of state and input.
 *
 * `index.ts` computes the session the binary prints and says of itself that it
 * is deliberately not a machine, because a machine with one state and no inputs
 * is a shape invented before anything asked for one. #85 is what asked. This is
 * that machine, and it wraps the session rather than replacing it: `finished`
 * is untouched, `session.test.ts` is unedited, and that both still pass is the
 * proof #84's floor survived.
 *
 * **The reducer owns the terminal; it does not own text editing.** `typed`
 * carries the whole buffer rather than a character, because the live element is
 * a real `<input>` and already owns backspace, selection, paste, composition
 * and whatever a phone's autocorrect decides to do. Reimplementing those here
 * would be reimplementing a text field badly, and fighting the browser on the
 * platform where it matters most. That is also why there is no caret in the
 * state below.
 *
 * No DOM, no timers, no clipboard -- checked by the compiler rather than by
 * review, because `tsconfig.test.json` builds this module with Bun's types and
 * no DOM lib at all.
 */

/**
 * Where the boot replay stands, while one is running.
 *
 * The frames are carried rather than recomputed, because `replay` deconstructs
 * a whole session and the timer would otherwise redo that work on every tick.
 * They are cheap to hold: each frame's `lines` is a fresh array over the same
 * `Line` objects the session already had.
 */
type Boot = { readonly frames: readonly Frame[]; readonly at: number }

export type Terminal = {
  /** What is on screen. Handed to the renderer unchanged, already capped. */
  readonly session: Session

  /**
   * The boot replay, while one is running, and `undefined` otherwise.
   *
   * **`undefined` means both *not started yet* and *finished*, and the two do
   * not need telling apart.** In either the session is the one the page was
   * served with, nothing is scheduled and nothing is pending -- which is the
   * whole of what anything downstream asks. The component dispatches
   * `replayed` exactly once, from a mount effect, so "not started" is a state
   * that lasts one render and answers every question the same way "finished"
   * does.
   */
  readonly boot: Boot | undefined

  /** What is typed at the prompt and not yet entered. */
  readonly buffer: string

  /** Every command entered, oldest first. Blanks and immediate repeats are not kept. */
  readonly history: readonly string[]

  /**
   * Where recall is standing.
   *
   * `history.length` means *not recalling*, and is the resting value -- one past
   * the end, which is how a shell's index works and what makes "at the bottom" a
   * comparison rather than a second flag to keep in step.
   */
  readonly recall: number

  /** The half-typed line recall borrowed the prompt from, given back on the way down. */
  readonly draft: string

  /** What the last input printed, as a screen reader is given it. */
  readonly announcement: string

  /**
   * How many times anything has been printed.
   *
   * A screen reader announces a *change*, and `help` run twice produces the same
   * sentence twice -- a live region whose text did not change is one an
   * assistive technology is right to stay quiet about. The component keys the
   * region's child on this, so the node is replaced and the same words are read
   * again. It exists for that and for nothing else.
   */
  readonly printed: number

  /**
   * What the visitor's browser is set to, as the provider last said it.
   *
   * Here rather than reached for, because this module has no browser to reach
   * into: `next-themes` owns the theme and `components/live.tsx` dispatches
   * what it answers. It is `detected`'s arrangement wearing different clothes
   * -- the module owns the question, the component asks it -- and it is the
   * whole of how a bare `theme` can report anything under `bun test`.
   */
  readonly preference: Preference
}

/**
 * What can happen to a terminal.
 *
 * Semantic rather than keyed. `{ kind: 'key'; key: string }` was the obvious
 * alternative and it satisfies "no DOM types" only on paper: `key` would be
 * `KeyboardEvent.key`'s vocabulary smuggled in as a string, every test would
 * spell `'ArrowUp'`, and this module would look pure while being a browser's
 * shape in disguise.
 *
 * `earlier` and `later` are named for the direction rather than the
 * consequence, and #86 is where that paid: the same two inputs move an open
 * select's cursor and recall history, and neither the component nor this type
 * had to learn a second word for a key that already had one.
 */
export type Input =
  | { readonly kind: 'typed'; readonly value: string }
  | { readonly kind: 'entered' }
  | { readonly kind: 'completed' }
  | { readonly kind: 'earlier' }
  | { readonly kind: 'later' }
  | { readonly kind: 'chosen'; readonly command: string }
  | { readonly kind: 'copied'; readonly intent: Copying }
  | { readonly kind: 'detected'; readonly agent: string }
  | { readonly kind: 'preferred'; readonly preference: Preference }
  | Replaying

/**
 * The three the boot replay is driven by.
 *
 * Named apart from the rest because they are the only inputs no visitor
 * performs: `replayed` and `advanced` come from the component's own mount and
 * its own timer, and `skipped` is the one a keypress reaches. Excluding them
 * from `Keyed` below is what stops `KEYS` naming a frame advance as though it
 * were a key somebody could press.
 */
type Replaying =
  | { readonly kind: 'replayed' }
  | { readonly kind: 'advanced' }
  | { readonly kind: 'skipped' }

type Keyed = Exclude<
  Input,
  | { kind: 'typed' }
  | { kind: 'chosen' }
  | { kind: 'copied' }
  | { kind: 'detected' }
  | { kind: 'preferred' }
  | Replaying
>['kind']

/**
 * Which keystroke means which input.
 *
 * A record rather than a switch in the component, so that "Tab completes" is a
 * fact this module states and `bun test` can read, and the component's whole job
 * is a lookup. The keys are `KeyboardEvent.key` values, spelled here rather than
 * imported, because this module compiles with no DOM lib at all -- which is the
 * point of `tsconfig.test.json`, and is not weakened by writing four strings.
 */
export const KEYS: Readonly<Record<string, Keyed>> = {
  Enter: 'entered',
  Tab: 'completed',
  ArrowUp: 'earlier',
  ArrowDown: 'later',
}

/**
 * The subset a page nobody has clicked on still answers.
 *
 * The page boots with a question on it and nothing focused, so a keystroke
 * reaches the window rather than the field -- and without this the menu's own
 * gesture, the one its legend advertises, does nothing at all until a visitor
 * thinks to click first. These are the keys a select owns, and the component
 * forwards them from the window when the prompt does not have them.
 *
 * **Tab is deliberately not among them.** Cancelling it out there would trap
 * focus on the page, since walking to the prompt is how a keyboard user reaches
 * it at all -- the same bug `e2e/prompt.spec.ts` found at the field itself, one
 * element over. Completion belongs to a prompt somebody is typing at, which is
 * the one place it can mean anything.
 *
 * A second record rather than a filter over `KEYS`, so that the decision reads
 * as a list somebody wrote and `bun test` can check the two agree about what
 * each key means.
 */
export const UNFOCUSED: Readonly<Record<string, Keyed>> = {
  Enter: 'entered',
  ArrowUp: 'earlier',
  ArrowDown: 'later',
}

/**
 * How many rows are kept.
 *
 * A terminal's own default is a thousand; this is half of it, because every row
 * here is a DOM node rather than a line in a ring buffer. Five hundred rows is
 * roughly two thousand nodes at four spans a row, which stays quick on the
 * phone `SITE.md` 06 measures at -- ten thousand, which a real terminal keeps
 * without noticing, would be forty thousand and would not.
 */
export const SCROLLBACK = 500

/**
 * The oldest rows go, and **the wordmark is not carved out of that.**
 *
 * It scrolls away like everything else, which is what a terminal does. Pinning
 * it would make the page a frame around a log, and a frame around a log is the
 * one thing ADR-0010 is trying not to be.
 *
 * Trimming only ever removes from the front, so it cannot put two blank rows
 * next to each other and the grid property survives untouched. The identity
 * return below the cap is not a micro-optimisation: it is what keeps
 * `terminal.session` referentially stable across a keystroke, so a memoised
 * renderer can skip the whole scrollback while somebody is typing.
 */
const capped = (lines: readonly Line[]): readonly Line[] =>
  lines.length <= SCROLLBACK ? lines : lines.slice(-SCROLLBACK)

export const booted = (session: Session): Terminal => ({
  session,
  // Not replaying. The reducer's first state is exactly the session the page
  // was served with, which is what a crawler, a browser whose JavaScript failed
  // and a visitor who asked for reduced motion all get -- and what #84's replay
  // is an enhancement over rather than a replacement for.
  boot: undefined,
  buffer: '',
  history: [],
  recall: 0,
  draft: '',
  announcement: '',
  printed: 0,
  // The served page, described rather than guessed at: `system` is the
  // provider's own default and `light` is what the stylesheet paints with no
  // class on it. `components/live.tsx` replaces it once the provider has
  // mounted and said what the visitor actually asked for.
  preference: RESTING,
})

/**
 * The rows above the open frame: everything on screen that is not the widget.
 *
 * A live select is always the last thing printed -- answering one or walking
 * away from one both redraw it before anything else is written underneath -- so
 * the frame is the tail, and redrawing it is a splice rather than a search.
 */
const above = (session: Session, open: Open): readonly Line[] =>
  session.lines.slice(0, session.lines.length - height(open))

/**
 * The frame, redrawn where it stands.
 *
 * `open` is what the session is *still* waiting for, so the two endings pass
 * nothing and the session comes back with no live widget on it.
 */
const redrawn = (terminal: Terminal, was: Open, drawn: readonly Line[], open?: Open): Session => ({
  lines: [...above(terminal.session, was), ...drawn],
  intents: terminal.session.intents,
  open,
})

/**
 * What a live region is handed, out of what was printed.
 *
 * The blanks go, because a screen reader has no use for the air a terminal puts
 * between things, and the rail and the sigils go with them -- `spoken` drops
 * every span the page marked as decoration.
 */
const said = (lines: readonly Line[]): string =>
  lines
    .map(spoken)
    .filter((line) => line !== '')
    .join('\n')

/**
 * An arrow, when the open select is the one it belongs to.
 *
 * **An empty prompt belongs to the widget; a prompt with something in it
 * belongs to the person typing.** One sentence, covering the arrows here and
 * Enter below, and it is what keeps #85's history reachable while #91's picker
 * is open rather than trading one for the other.
 *
 * `undefined` means the select did not want the key, and the caller falls
 * through to the history it has always done.
 */
const selecting = (terminal: Terminal, by: 1 | -1): Terminal | undefined => {
  const open = terminal.session.open
  if (open === undefined || terminal.buffer !== '') return undefined

  const next = moved(open, by)

  return {
    ...terminal,
    session: redrawn(terminal, open, asking(next), next),
    // Moving the cursor is the one thing on this page a sighted visitor can see
    // and a screen reader would otherwise be told nothing about. The row it
    // lands on is what is said, and the count is bumped so that walking back
    // onto a row already visited is announced again.
    announcement: spoken(active(next)),
    printed: terminal.printed + 1,
  }
}

/**
 * A row of the open select, answered.
 *
 * **The frame collapses first, and then the row runs the command it launches**
 * -- through the same path a typed line takes, so what an entry prints is what
 * the command prints, echo and history and all. That is ADR-0007 quoted rather
 * than paraphrased: the menu is a launcher, an entry runs a command that
 * already exists, and nothing a visitor learns here is wrong at a real prompt.
 *
 * A row carrying no command runs nothing, which is the whole of what `quit` is.
 * The collapsed frame is the record that the question was answered, and the
 * prompt below is where the visitor lands.
 */
const picked = (terminal: Terminal, open: Open, at: number): Terminal => {
  const option = open.options[at]!
  const frame = answered({ ...open, cursor: at })

  const left: Terminal = {
    ...terminal,
    session: redrawn(terminal, open, frame),
    buffer: '',
  }

  return option.runs === undefined
    ? {
        ...left,
        recall: left.history.length,
        draft: '',
        // The exchange, as a screen reader is given it: the question, and the
        // answer it was given. Derived rather than written, so a second caller
        // with a way out of its own announces its own words.
        announcement: said(frame),
        printed: terminal.printed + 1,
      }
    : entered({ ...left, buffer: option.runs })
}

const entered = (terminal: Terminal): Terminal => {
  const open = terminal.session.open
  const typed = terminal.buffer.trim()

  if (open !== undefined) {
    // An empty prompt belongs to the widget, so Enter answers the question the
    // legend says it answers. A word that names a row is the same answer
    // reached by typing -- which is the only way `quit` can mean anything at a
    // prompt where it is not a command, and it keeps a typed `add` and a chosen
    // `add` from being two different things.
    const answering = typed === '' ? open.cursor : named(open, typed)
    if (answering !== undefined) return picked(terminal, open, answering)
  }

  if (typed === '') return terminal

  // Whatever was typed is not an answer to the question on screen, so the
  // question is over. The frame collapses to the library's cancel, which is
  // what Ctrl-C draws at the real menu -- and `cli/src/menu.ts` says a cancel
  // leaves the same way `quit` does. Leaving it drawn as it was would be worse
  // than untidy: a legend still offering to navigate, above output, on a widget
  // nothing can move any more.
  const walked: Terminal =
    open === undefined
      ? terminal
      : { ...terminal, session: redrawn(terminal, open, abandoned(open)) }

  const printed = run(walked.buffer, walked.preference)

  // The frame a command asked for, drawn here rather than by `run` -- this is
  // also what marks the question live, and one description of a widget cannot
  // disagree with itself where two could.
  const opened = printed.opens === undefined ? [] : asking(printed.opens)

  // One blank row of air above the echo, and none when there is nothing above
  // it to be separated from -- which is the state `clear` leaves behind. The
  // CLI never double-spaces and neither does this.
  const appended = [
    ...walked.session.lines,
    ...(walked.session.lines.length > 0 ? [blank()] : []),
    printed.echo,
    ...printed.body,
  ]

  // Immediate repeats are not recorded, or up-arrow after running something
  // twice walks through a wall of the same word.
  const history = walked.history.at(-1) === typed ? walked.history : [...walked.history, typed]

  return {
    // Nothing is replaying by the time a command runs: `after` collapses the
    // boot ahead of every input but its own timer's, so a command is only ever
    // entered against the finished session. Spelled rather than carried, so
    // this stays true by statement rather than by inheritance.
    boot: undefined,

    // **`intents` is replaced rather than carried, and #91 is what settled
    // that.** An intent lives for exactly the transition that declared it. The
    // alternative -- accumulating them -- would have every later keystroke
    // hand the component a clipboard write it had already performed, so the
    // question "when does a performed intent leave the array" would have to be
    // answered by whoever performs them. Here it never arises.
    session: {
      lines: printed.clears === true ? [] : capped([...appended, ...opened]),
      intents: printed.intents ?? [],

      // The question this line just opened, or none. Either there was no
      // question and none was asked for, or the frame above closed the one
      // there was -- and `clear` empties the rows a live one would have been
      // drawn in, so nothing here can leave a widget the reducer believes it
      // can move and the visitor cannot see.
      open: printed.opens,
    },
    buffer: '',
    history,
    recall: history.length,
    draft: '',
    // The frame is included, because a question that opened and was not read
    // out is a page waiting on an answer nobody was told it wanted.
    announcement: printed.announcement ?? said([...printed.body, ...opened]),
    printed: walked.printed + 1,
    // Carried, because this branch spells the whole terminal out rather than
    // spreading one -- which is deliberate, and is why every field it does not
    // reset has to be named here.
    preference: walked.preference,
  }
}

/** Still on the first word: leading space, then the prefix, then the end. */
const FIRST = /^(\s*)(\S*)$/

/** On the second: a first word, the gap after it, then the prefix. */
const SECOND = /^(\s*)(\S+)(\s+)(\S*)$/

/**
 * What Tab has to work with, or nothing where there is nothing to complete.
 *
 * `words` is the vocabulary the prefix is measured against, and it is carried
 * rather than looked up below because the two positions do not share one: a
 * first word is always a command name, and a second is whatever the verb in
 * front of it says it takes.
 */
type Completing = {
  readonly before: string
  readonly prefix: string
  readonly words: readonly string[]
  readonly first: boolean
}

/**
 * Which word the caret is on, and whether anything may be completed there.
 *
 * Two positions, because since #87 there are two. The first word is always a
 * command name. The second is one only after a word that takes an argument --
 * `help` today -- so `add fo` stays the no-op #85 made it rather than becoming
 * a page that completes an argument `add` would never be handed here.
 */
const completing = (buffer: string): Completing | undefined => {
  const first = FIRST.exec(buffer)

  if (first !== null) {
    const [, lead = '', prefix = ''] = first
    return prefix === '' ? undefined : { before: lead, prefix, words: NAMES, first: true }
  }

  const second = SECOND.exec(buffer)
  if (second === null) return undefined

  const [, lead = '', name = '', gap = '', prefix = ''] = second
  const command = find(name)
  if (command?.takesArgument !== true) return undefined

  return prefix === ''
    ? undefined
    : // Absent means a command name, which is what `help` takes.
      { before: lead + name + gap, prefix, words: command.takes ?? NAMES, first: false }
}

/**
 * Completion, and the shape of doing nothing.
 *
 * A prefix two commands answer to completes to neither. This is a deliberate
 * departure from bash, which fills in the longest common prefix and lists the
 * candidates on a second Tab: #85's criterion reads plainly as *nothing*, and
 * this is the literal reading of it. The cost is that `c` is silent and may
 * feel broken; `help` is four keystrokes away.
 *
 * That rule now covers a bare `help ` as well, where every command is a match
 * and none of them is the only one -- so Tab on an empty second word is silent
 * for the reason Tab on an empty first word always was.
 *
 * **A trailing space only where a word follows.** `version` gets none, because
 * a phantom space would sit under the caret with nothing to type into it;
 * `help` gets one, because the next thing to type is a command name and #87 is
 * what gave it one. Read off `takesArgument` rather than off the name, so #91's
 * `install` arrives here already handled.
 */
const completed = (terminal: Terminal): Terminal => {
  const asked = completing(terminal.buffer)
  if (asked === undefined) return terminal

  const matches = asked.words.filter((word) => word.startsWith(asked.prefix))
  const only = matches.length === 1 ? matches[0] : undefined
  if (only === undefined) return terminal

  const filled = asked.first && find(only)?.takesArgument === true ? `${only} ` : only

  return { ...terminal, buffer: asked.before + filled }
}

/**
 * Whether Tab has anything to fill in here.
 *
 * **#89 is what asked for this, and it asked because the prompt stopped being
 * the last thing on the page.** `components/live.tsx` cancels Tab at the field
 * so that completion can own the key -- which cost nothing while the field was
 * the end of the tab order, and became a trap the moment a chip row was pinned
 * below it: forward is the only way to reach the row, and a cancelled key never
 * gets there. So the component asks this first and lets the key go when the
 * answer is no, which is every empty prompt and every ambiguous prefix.
 *
 * Nothing about completion is re-decided here. It is `completed`'s own identity
 * return read as a question -- *did that change anything* -- which is the
 * property `after`'s docblock calls the crispest available statement of the Tab
 * criterion, and the one every case in `test/terminal.test.ts` already asserts
 * against. A second predicate that decided it independently could disagree with
 * the transition it is supposed to describe; this cannot.
 */
export const completes = (terminal: Terminal): boolean => completed(terminal) !== terminal

/**
 * A value put on the clipboard again, and nothing else.
 *
 * **Nothing is printed, which is the whole of what the control is for.** #91
 * asks that the command left in the scrollback can be copied again *without
 * re-running anything* -- so this is not `chosen` with a different payload, and
 * `Span.copies` is not `Span.runs`. Running the command would reprint the block
 * the control is standing in, every time somebody used it.
 *
 * That leaves nothing on screen to say it happened, so the announcement is the
 * only record and `printed` is bumped to make a live region read it again --
 * copying the same value twice is two events and produces the same sentence.
 */
const copied = (terminal: Terminal, intent: Copying): Terminal => ({
  ...terminal,
  session: { ...terminal.session, intents: [intent] },
  announcement: `Copied ${intent.what}.`,
  printed: terminal.printed + 1,
})

/**
 * The visitor's own system, once the page is somewhere that has one.
 *
 * **It rebuilds rather than editing the rows, and that is the point**: there is
 * one description of what this page looks like for a given system, and this
 * produces it. The session a visitor ends up with is byte for byte the session
 * that system would have been served, which is a property a test can state --
 * where a splice into the middle of the scrollback would only be a procedure
 * somebody has to keep correct.
 *
 * **It reaches down to `index.ts` for that, and the direction is right.** The
 * rule this repo states three times is that a *leaf* must not reach back
 * through the module that composes it -- why `COMMENT`, `Open` and `System` all
 * sit below the things that assemble them. This file is not a leaf. It is the
 * top of the module and says so: it *wraps* the finished session rather than
 * replacing it, exactly as it already reaches down to `boot.ts` to take one
 * apart. Nothing imports this file but the component.
 *
 * The version comes from the same constant `app/page.tsx` builds the served
 * session from, which is the only production caller of either -- so this cannot
 * disagree with what was served, because there is one number rather than two.
 * Carrying it on the state instead would put a second copy of it in play to
 * protect against a divergence nothing can cause.
 *
 * Two ways to change nothing, and both hand back the terminal they were given.
 * A guess that failed leaves whatever the page was served with, because a
 * fallback here would be this module choosing for a visitor it knows nothing
 * about. And a page somebody has already used is left alone: the component
 * dispatches this once, from a mount effect, so in practice nothing has
 * happened yet -- the guard is what makes that a property of the reducer rather
 * than an ordering the component has to keep.
 */
const detected = (terminal: Terminal, agent: string): Terminal => {
  const system = guessed(agent)
  if (system === undefined || terminal.printed > 0) return terminal

  return { ...terminal, session: finished(CLI_VERSION, system) }
}

/**
 * What the provider says the visitor is looking at.
 *
 * **It changes nothing on screen, and that is the whole of it.** The rows a
 * theme moves are painted by a stylesheet from two custom properties that swap
 * places, so a switch is a class on `<html>` rather than a session redrawn --
 * which is why this stores an answer and prints nothing, where `detected`
 * rebuilds the session outright.
 *
 * `printed` is deliberately not bumped. A live region has nothing to say about
 * a preference arriving, and bumping it would step past `detected`'s
 * `printed > 0` guard and cost the visitor the system detection their own
 * stored theme happened to arrive before.
 *
 * A preference that changed nothing hands back the terminal it was given,
 * which matters more here than anywhere: this is dispatched from an effect
 * keyed on values the provider re-publishes, so the no-op is the common case.
 */
const preferred = (terminal: Terminal, preference: Preference): Terminal =>
  terminal.preference.theme === preference.theme &&
  terminal.preference.system === preference.system
    ? terminal
    : { ...terminal, preference }

const earlier = (terminal: Terminal): Terminal => {
  if (terminal.recall === 0) return terminal

  const recall = terminal.recall - 1

  return {
    ...terminal,
    recall,
    buffer: terminal.history[recall]!,
    // Borrowed on the way out of rest, and only then -- a second press must not
    // overwrite the line the first one put away.
    draft: terminal.recall === terminal.history.length ? terminal.buffer : terminal.draft,
  }
}

const later = (terminal: Terminal): Terminal => {
  if (terminal.recall === terminal.history.length) return terminal

  const recall = terminal.recall + 1

  return {
    ...terminal,
    recall,
    buffer: recall === terminal.history.length ? terminal.draft : terminal.history[recall]!,
  }
}

/**
 * The boot replay, one frame at a time.
 *
 * `showing` is the only thing that moves it. Reaching the last frame puts
 * `boot` back to `undefined` rather than leaving it parked on the end, so
 * "is anything still replaying" is one comparison and there is no terminal
 * frame to remember not to schedule after.
 *
 * The last frame's `lines` is the array `finished` returned -- `boot.ts` hands
 * it back rather than a copy -- so a replay that ran to its end leaves the
 * renderer holding the very rows it was prerendered with.
 *
 * **Everything but the rows is carried through**, which since #86 means the
 * open select as well as the intents. A replay is the page redrawing what it
 * was served, so what the served page was waiting for is still what the last
 * frame is waiting for. That the intermediate frames say so too, while the
 * frame is still half-drawn, is unobservable: `after` collapses a replay ahead
 * of every input but its own timer's, so nothing can answer a question that is
 * not finished being asked.
 */
const showing = (terminal: Terminal, frames: readonly Frame[], at: number): Terminal => ({
  ...terminal,
  session: { ...terminal.session, lines: frames[at]!.lines },
  boot: at === frames.length - 1 ? undefined : { frames, at },
})

/**
 * How long the frame on screen is held before the next one, and `undefined`
 * when nothing is replaying.
 *
 * The whole of what the component needs to drive the boot, so `Boot` itself
 * stays private: the effect schedules one number and asks nothing about where
 * the replay is or how many frames are left.
 */
export const pause = (terminal: Terminal): number | undefined =>
  terminal.boot === undefined ? undefined : terminal.boot.frames[terminal.boot.at]!.hold

const skipped = (terminal: Terminal): Terminal =>
  terminal.boot === undefined
    ? terminal
    : showing(terminal, terminal.boot.frames, terminal.boot.frames.length - 1)

const advanced = (terminal: Terminal): Terminal =>
  terminal.boot === undefined
    ? terminal
    : showing(terminal, terminal.boot.frames, terminal.boot.at + 1)

/**
 * One input, applied.
 *
 * **Every branch that changes nothing returns the terminal it was handed.**
 * That is not an optimisation: it is what makes "does nothing" a `toBe`
 * assertion at seam one rather than an argument about deep equality, and it is
 * the crispest available statement of the Tab criterion.
 *
 * `chosen` is defined by composition rather than by a second path, so a word
 * that was clicked and a word that was typed cannot drift apart.
 *
 * **Every input but the timer's own reaches the end of the boot first, and that
 * is the whole of #84's skip.** A listener in the component could say it for a
 * keystroke and could not say it for a word that was clicked -- which would
 * otherwise print into a session still being drawn, and have the next frame
 * overwrite what it printed. Collapsing here makes that unreachable instead of
 * handled, and makes "any keypress skips" a fact `bun test` can read.
 *
 * The `boot === undefined` half of the guard is not an optimisation either: it
 * is what keeps the paragraph above true once a collapse runs ahead of every
 * input. With nothing replaying, `settled` *is* `terminal`, and every no-op
 * branch still hands back the object it was given.
 */
export const after = (terminal: Terminal, input: Input): Terminal => {
  const settled =
    input.kind === 'advanced' || input.kind === 'preferred' || terminal.boot === undefined
      ? terminal
      : skipped(terminal)

  switch (input.kind) {
    case 'typed':
      return { ...settled, buffer: input.value, recall: settled.history.length }
    case 'entered':
      return entered(settled)
    case 'completed':
      return completed(settled)
    case 'earlier':
      return selecting(settled, -1) ?? earlier(settled)
    case 'later':
      return selecting(settled, 1) ?? later(settled)
    case 'chosen':
      return after(after(settled, { kind: 'typed', value: input.command }), { kind: 'entered' })
    case 'copied':
      return copied(settled, input.intent)
    case 'detected':
      return detected(settled, input.agent)

    // Exempt from the collapse above, with `advanced`, and for a reason worth
    // stating rather than inferring: this is not a visitor doing anything. It
    // arrives from the provider on mount, before anybody has touched the page,
    // so collapsing on it would skip the boot for every visitor who has ever
    // chosen a theme -- and skip it for the rest as soon as the provider
    // settled on following their system.
    case 'preferred':
      return preferred(settled, input.preference)

    // Rewinds, rather than resuming, so a second dispatch is a boot rather than
    // two -- which is what React's StrictMode does to a mount effect in `dev`.
    // `settled` has already collapsed any replay in flight, so this always
    // deconstructs the finished session rather than a frame of itself.
    case 'replayed':
      return showing(settled, replay(settled.session), 0)
    case 'advanced':
      return advanced(settled)

    // Already done, above. The input exists so the component has something to
    // dispatch on a keypress without pretending the key meant anything else.
    case 'skipped':
      return settled
  }
}
