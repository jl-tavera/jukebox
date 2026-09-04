import { decoration, ink, PROMPT, row, text, TYPED, type Line, type Session } from './lines'

/**
 * The boot, as frames -- what the page shows on the way to what it was served
 * with.
 *
 * The page ships the finished session in its HTML, and #84 replays it: the
 * command types itself at the prompt, a beat lands as if Enter had been
 * pressed, and the binary's output scrolls in under it. That is an enhancement
 * over a floor that already exists rather than the only way to see the page,
 * which is what lets a keypress skip it and reduced motion decline it without
 * either costing a word of content.
 *
 * **The frames are deconstructed from the finished session, never written
 * beside it.** The last frame is the array `finished` returned, handed back
 * unchanged, so the replay can only ever end exactly where the served HTML
 * already is -- and #86 or #88 growing that session cannot leave a second
 * description of it here going stale. Nothing in this file knows what the boot
 * says; it only knows the order a terminal would have shown it in.
 *
 * No DOM, no timers, no clipboard. Every duration below is a number this module
 * states and `components/live.tsx` performs, which is what keeps the pacing
 * answerable under `bun test` with no browser in the room -- and the reason
 * `test/boot.test.ts` can pin the whole budget rather than measure it.
 */

/**
 * The longest the boot may take, and the one figure in #84 that is a
 * requirement rather than a target.
 *
 * Exported because two seams consume it: `test/boot.test.ts` sums the frames
 * against it, which is where it is actually enforced, and `e2e/boot.spec.ts`
 * names it when it waits for the real thing. A wall clock in a browser cannot
 * hold this number -- hydration, `font-display: block` and a loaded CI runner
 * all land on top of the budget -- so seam three waits for the boot to finish
 * and this file is what says it finishes in time.
 */
export const CAP = 2500

/**
 * The question the page asks before it replays anything.
 *
 * Spelled here rather than in the component, for the reason `KEYS` gives one
 * module over: this file compiles with no DOM lib at all, and a media query is
 * a string whichever program reads it. Keeping it beside the frames means the
 * component, the jsdom harness and the browser are all asking the same question
 * -- and a stub answering a query nobody asks is a test that proves nothing.
 *
 * **Reduced motion renders the finished session rather than nothing.** That is
 * only possible because the floor is real: the session is in the served HTML,
 * so declining the animation costs no content at all.
 */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** What #84 asks a character to take. */
export const QUICKEST = 60
export const SLOWEST = 80

/**
 * The rhythm of a hand at a keyboard, as a cycle rather than a random.
 *
 * Jitter is what stops the typing reading as a machine, and `Math.random` is
 * the obvious way to get it and the wrong one here: this module is pure, and
 * `test/session.test.ts` already holds the neighbouring one to computing the
 * same answer twice. A fixed cycle indexed by position is indistinguishable
 * from random at this length and leaves the whole budget a fact rather than a
 * distribution to argue about.
 *
 * Five values against a seven-character command, so the cycle does not line up
 * with the word and repeat the same beat under the same letter.
 */
const KEYSTROKES: readonly number[] = [68, 62, 78, 66, 74]

/** How long the character at `index` is held before the next one lands. */
export const keystroke = (index: number): number => KEYSTROKES[index % KEYSTROKES.length]!

/**
 * The pause after the last character, as if Enter had landed.
 *
 * Without it the command and its output are one continuous motion, and the page
 * never shows the thing it is quoting: a person typing, stopping, and a program
 * answering.
 */
export const BEAT = 180

/** One row of output, thereafter. */
export const ROW = 60

/**
 * One step of the replay: what is on screen, and how long it stays.
 *
 * `hold` rather than `after`, because `after` is already the name of the
 * reducer's central verb and the two would sit a line apart in `terminal.ts`.
 *
 * **It is a number in the state rather than an `Intent`.** `lines.ts` names
 * scheduling a timer among the things that leave this module as a declaration,
 * and a timer is the one such effect that has to be *cancelled* -- on a skip and
 * on an unmount -- which means a handle the component has to keep either way.
 * An intent carries no handle, so declaring one would be ceremony on top of
 * state that has to exist regardless.
 */
export type Frame = { readonly lines: readonly Line[]; readonly hold: number }

/**
 * One line on its way onto the screen, and whether it replaces the line before
 * it or follows it.
 */
type Arrival = { readonly line: Line; readonly grows: boolean }

/**
 * The prompt with the first `typed` characters of the command on it.
 *
 * The empty case draws no span rather than an empty one: nothing has been typed
 * yet, and a `<span></span>` in the markup would be the renderer describing a
 * character that is not there.
 */
const typing = (before: readonly Line[], typed: string): Line[] => [
  ...before,
  typed === '' ? row(decoration(`${PROMPT} `)) : row(decoration(`${PROMPT} `), ink(typed)),
]

/**
 * Every line the boot prints, with the wordmark expanded into its own rows.
 *
 * **The art arrives as rows and never as characters**, which is what makes "no
 * half-drawn row is ever visible" true by construction rather than by timing.
 * The mark is 335 Block Elements; typing them would be slow and would spend
 * most of that time showing rows that read as noise. A banner scrolling into a
 * real terminal arrives as lines, so this one does.
 *
 * Each partial mark is a whole `art` line carrying the rows so far, so the
 * renderer needs to know nothing about any of this -- it is handed a session
 * and draws it, exactly as it does for every other frame.
 */
const arriving = (lines: readonly Line[]): Arrival[] =>
  lines.flatMap((line): Arrival[] =>
    line.kind === 'art'
      ? line.text.split('\n').map((_, index, rows) => ({
          line: {
            kind: 'art' as const,
            text: rows.slice(0, index + 1).join('\n'),
            label: line.label,
          },
          // Every row but the first is the same mark, one row taller.
          grows: index > 0,
        }))
      : [{ line, grows: false }],
  )

/**
 * The screen after one more line arrives.
 *
 * **Whether an arrival replaces the line before it is carried rather than
 * inferred**, and the difference is not theoretical. Deciding it by asking
 * whether the last two lines are both art was the first shape of this, and it
 * is wrong the moment a session holds two marks: the second one's opening row
 * would replace the first one's last, and a finished line would appear and then
 * vanish -- which is the one property every frame here is meant to have. Saying
 * which arrivals replace and which append is a decision, and `arriving` above
 * is where it is already known.
 */
const shown = (before: readonly Line[], arrival: Arrival): Line[] =>
  arrival.grows ? [...before.slice(0, -1), arrival.line] : [...before, arrival.line]

/**
 * The finished session, as the frames that arrive at it.
 *
 * Takes what `finished` returned and nothing else. The command it types is
 * located by its text rather than by an index, so inserting a line above it
 * moves nothing here -- and a session that has no such line throws, because a
 * replay that cannot find the command it exists to type is a programming error
 * and belongs in `bun test` rather than on a visitor's screen.
 */
export const replay = (session: Session): readonly Frame[] => {
  const command = `${PROMPT} ${TYPED}`
  const at = session.lines.findIndex((line) => text(line) === command)

  if (at < 0) {
    throw new Error(`lib/session/boot: no \`${command}\` line to replay in this session`)
  }

  const before = session.lines.slice(0, at)

  // One frame per character, then the session's own line rather than a rebuilt
  // one -- the same reasoning as the last frame below, one row up.
  const typed: Frame[] = [
    ...Array.from({ length: TYPED.length }, (_, n) => ({
      lines: typing(before, TYPED.slice(0, n)),
      hold: keystroke(n),
    })),
    { lines: [...before, session.lines[at]!], hold: BEAT },
  ]

  const arrivals = arriving(session.lines.slice(at + 1)).reduce<Line[][]>(
    (frames, arrival) => [...frames, shown(frames.at(-1) ?? typed.at(-1)!.lines, arrival)],
    [],
  )

  return [
    ...typed,
    ...arrivals.map((lines, index) => {
      const last = index === arrivals.length - 1

      // The last frame hands back the array the page was served with, so the
      // replay ends on the floor itself rather than on a copy of it, and holds
      // there because nothing follows.
      return { lines: last ? session.lines : lines, hold: last ? 0 : ROW }
    }),
  ]
}
