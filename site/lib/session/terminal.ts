import { COMMANDS, run } from './commands'
import { blank, spoken, type Line, type Session } from './lines'

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

export type Terminal = {
  /** What is on screen. Handed to the renderer unchanged, already capped. */
  readonly session: Session

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
 * consequence, which is what lets #86 add a branch instead of a vocabulary: the
 * same two keys move the menu's cursor while the menu is open.
 */
export type Input =
  | { readonly kind: 'typed'; readonly value: string }
  | { readonly kind: 'entered' }
  | { readonly kind: 'completed' }
  | { readonly kind: 'earlier' }
  | { readonly kind: 'later' }
  | { readonly kind: 'chosen'; readonly command: string }

type Keyed = Exclude<Input, { kind: 'typed' } | { kind: 'chosen' }>['kind']

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
  buffer: '',
  history: [],
  recall: 0,
  draft: '',
  announcement: '',
  printed: 0,
})

const entered = (terminal: Terminal): Terminal => {
  const typed = terminal.buffer.trim()
  if (typed === '') return terminal

  const printed = run(terminal.buffer)

  // One blank row of air above the echo, and none when there is nothing above
  // it to be separated from -- which is the state `clear` leaves behind. The
  // CLI never double-spaces and neither does this.
  const appended = [
    ...terminal.session.lines,
    ...(terminal.session.lines.length > 0 ? [blank()] : []),
    printed.echo,
    ...printed.body,
  ]

  // Immediate repeats are not recorded, or up-arrow after running something
  // twice walks through a wall of the same word.
  const history =
    terminal.history.at(-1) === typed ? terminal.history : [...terminal.history, typed]

  return {
    // `intents` is carried through rather than replaced. #85 declares none --
    // `help` and `clear` write no clipboard and set no timer -- so the question
    // of when a performed intent leaves the array stays unopened, and #88 is
    // the ticket that has to answer it.
    session: {
      lines: printed.clears === true ? [] : capped(appended),
      intents: terminal.session.intents,
    },
    buffer: '',
    history,
    recall: history.length,
    draft: '',
    announcement:
      printed.announcement ??
      printed.body
        .map(spoken)
        .filter((said) => said !== '')
        .join('\n'),
    printed: terminal.printed + 1,
  }
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
 * No trailing space on a match, because nothing on this page takes an argument
 * yet and a phantom space would sit under the caret. #87 and #91 add one when
 * there is something to type after it.
 */
const completed = (terminal: Terminal): Terminal => {
  const prefix = terminal.buffer.trim()
  if (prefix === '' || /\s/.test(prefix)) return terminal

  const matches = COMMANDS.filter((command) => command.name.startsWith(prefix))
  const only = matches.length === 1 ? matches[0] : undefined

  return only === undefined ? terminal : { ...terminal, buffer: only.name }
}

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
 * One input, applied.
 *
 * **Every branch that changes nothing returns the terminal it was handed.**
 * That is not an optimisation: it is what makes "does nothing" a `toBe`
 * assertion at seam one rather than an argument about deep equality, and it is
 * the crispest available statement of the Tab criterion.
 *
 * `chosen` is defined by composition rather than by a second path, so a word
 * that was clicked and a word that was typed cannot drift apart.
 */
export const after = (terminal: Terminal, input: Input): Terminal => {
  switch (input.kind) {
    case 'typed':
      return { ...terminal, buffer: input.value, recall: terminal.history.length }
    case 'entered':
      return entered(terminal)
    case 'completed':
      return completed(terminal)
    case 'earlier':
      return earlier(terminal)
    case 'later':
      return later(terminal)
    case 'chosen':
      return after(after(terminal, { kind: 'typed', value: input.command }), { kind: 'entered' })
  }
}
