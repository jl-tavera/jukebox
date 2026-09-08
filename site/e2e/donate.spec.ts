import { expect, test } from '@playwright/test'
import { enter, open, scrollsHorizontally } from './harness'

/**
 * The donation rows, in the only place their remaining questions can be asked.
 *
 * Seam three, and the boundary is `install.spec.ts`'s. What the block prints,
 * which rows carry a control, and that the whole address rather than the
 * truncation is what the control declares -- all of it is a pure function of
 * `donations`, answered in `test/donate.test.ts` with no browser in the room.
 *
 * **Three of this file's four cases lost their subject to #112, and the
 * guarantee behind them is worth recording rather than dropping quietly.**
 * ADR-0010 deleted a native `<dialog>`, which had given focus trapping, Escape
 * and a visible focus state away free -- *"precisely the parts of a modal most
 * often got wrong by hand"* -- and moved the copy controls into the scrollback.
 * That turned the last of those from a gift into a claim, and this file was
 * where the claim was held: five controls on one screen, each a 44px target,
 * each reachable by keyboard, each inverting when focused.
 *
 * A terminal draws text. There is no control in a character grid to hit or to
 * focus, so those three measure nothing now and are gone rather than
 * re-pointed. **What replaced them is not nothing**: the copy itself is checked
 * end to end in `install.spec.ts`, against a real clipboard, which is the half
 * that actually matters to somebody trying to donate -- and the target, the
 * focus state and the contrast ratio are held in `chips.spec.ts` against the
 * row that is still real DOM. The gap that remains is honest and narrow: a
 * visitor who cannot use a mouse can run `donate`, read the addresses and copy
 * one by selecting it, but there is no longer a control to tab to.
 */

test.describe('the rows donate prints', () => {
  test('wraps the long note rather than dragging the page sideways', async ({ page }) => {
    // The EVM row names five chains and is the longest string the page prints.
    // Wrapping is the CLI's own rule: a long line cut off is a line a reader
    // cannot search for, and a narrow terminal wraps.
    //
    // **This is a stronger check than it was**, because the wrapping is now the
    // emulator's rather than the browser's. A grid whose column count was
    // measured against the wrong width does not reflow a long row -- it runs it
    // off the side, which is exactly what this asks about, at the width where
    // it would first show.
    await open(page)
    await enter(page, 'donate')

    expect(await scrollsHorizontally(page)).toBe(false)
  })
})
