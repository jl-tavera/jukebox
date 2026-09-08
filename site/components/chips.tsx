import type { Landing, Tone } from '@/lib/session/lines'

/**
 * The status line -- #89, and since #112 the only real DOM the page draws.
 *
 * A row of the page's own verbs, pinned below the terminal, so the page is
 * operable by tapping. ADR-0010 makes it load-bearing rather than decoration:
 * the corner theme toggle is gone, `theme` is a command with no chrome, and
 * this row is the whole of how a visitor finds out the control exists. *If the
 * chips go, the theme control goes with them.*
 *
 * **It was never part of a session, and now that is the whole reason it
 * survived.** `components/screen.tsx` turned sessions into markup and is
 * deleted; the scrollback is a terminal emulator's business now, and nothing in
 * it can be focused or tapped. That makes this row the only place the
 * touch-target floor still applies, which #114 records as a regression rather
 * than a design. The distinction was always observable: `clear` empties the
 * scrollback and the status line has to survive it, which a row of the session
 * could not.
 *
 * It draws nothing of its own. The words, their order and their voice are
 * `CHIPS` in `lib/session/commands.ts`, and running one is `handleInput` in
 * `components/live.tsx` -- the same path a keystroke takes. The page has no
 * buttons anywhere else and this row does not introduce a second kind.
 *
 * `role="group"` rather than `nav` or `toolbar`: these are commands rather than
 * links, and a toolbar would promise arrow-key roving this row deliberately
 * does not implement -- the arrows belong to the shell's history. What the
 * group buys is a name for the row, so a screen reader reaching `help` is told
 * what it is among.
 */

/**
 * The ladder, as classes.
 *
 * Moved here from the deleted renderer with `Landable`, and narrowed to what
 * one consumer needs rather than ported whole: every chip is `prose`, so the
 * other three rungs are here to keep the map total rather than because anything
 * reaches them. A `Record` rather than a lookup with a default, for the reason
 * the renderer gave: a fifth rung arrives as a compile error.
 */
const TONE: Record<Tone, string | undefined> = {
  inverted: 'bg-ink text-ground',
  ink: undefined,
  prose: 'u-prose',
  dim: 'text-dim',
}

/** Every class that applies, joined, and an empty string where none does. */
const classed = (...names: readonly (string | undefined)[]): string =>
  names.filter((name) => name !== undefined).join(' ')

/**
 * A word the cursor can land on.
 *
 * The last survivor of `components/screen.tsx`, kept because the chip row is
 * still real DOM and still has to be reachable by a finger and by Tab. It is a
 * `<button>` with none of a button's appearance -- `globals.css` strips the
 * chrome and `::before` gives it a 44px target the text itself is too short to
 * provide.
 */
const Landable = ({
  text,
  runs,
  tone,
  onRun,
}: {
  text: string
  runs: string
  tone: Tone
  onRun: (command: string) => void
}) => (
  <button type="button" className={classed('u-word', TONE[tone])} onClick={() => onRun(runs)}>
    {text}
  </button>
)

export const Chips = ({
  chips,
  onRun,
}: {
  chips: readonly Landing[]
  onRun: (command: string) => void
}) => (
  <div className="u-chips" role="group" aria-label="site verbs">
    {chips.map((chip) => (
      <Landable
        key={chip.text}
        text={chip.text}
        runs={chip.runs}
        tone={chip.tone}
        onRun={onRun}
      />
    ))}
  </div>
)
