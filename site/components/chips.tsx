import { Landable } from '@/components/screen'
import type { Landing } from '@/lib/session/lines'

/**
 * The status line -- #89.
 *
 * A row of the page's own verbs, pinned below the prompt, so the page is
 * operable by tapping. ADR-0010 makes it load-bearing rather than decoration:
 * the corner theme toggle is gone, `theme` is a command with no chrome, and
 * this row is the whole of how a visitor finds out the control exists. *If the
 * chips go, the theme control goes with them.*
 *
 * **It is not a `Line`, and that is the whole reason this file exists.**
 * `components/screen.tsx` turns a session into markup and says so; the chip row
 * is not part of a session. The distinction is observable rather than tidy:
 * `clear` empties the scrollback and the status line has to survive it, which a
 * row of `session.lines` could not.
 *
 * It draws nothing of its own. The words, their order and their voice are
 * `CHIPS` in `lib/session/commands.ts`, and the control is `Landable` -- the
 * same word the scrollback lands on, the same class, the same invisible tap
 * target. The page has no buttons and this row does not introduce the first
 * one.
 *
 * `role="group"` rather than `nav` or `toolbar`: these are commands rather than
 * links, and a toolbar would promise arrow-key roving this row deliberately
 * does not implement -- the arrows belong to the prompt's history and to an
 * open select. What the group buys is a name for the row, so a screen reader
 * reaching `help` is told what it is among.
 */
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
