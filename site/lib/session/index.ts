import { hero, MENU_ENTRIES, WHAT_NEXT } from '../content'
import { header } from './header'
import {
  blank,
  COMMENT,
  decoration,
  ink,
  PROMPT,
  prose,
  row,
  TYPED,
  type Open,
  type Session,
} from './lines'
import { asking } from './select'

/**
 * The finished session: what the page says, and what it needs done.
 *
 * A pure function of one version string. No DOM, no timers, no clipboard --
 * checked by the compiler rather than by review, because `tsconfig.test.json`
 * builds this module with Bun's types and no DOM lib at all, so reaching for
 * `document` or `setTimeout` here does not compile.
 *
 * **This is the floor, not the finished page.** #82 delivers the session as
 * static content so that everything else has something to stand on: #84 clears
 * it and replays it as typing, #85 puts a live prompt under it, #86 makes the
 * menu navigable. Each of those adds a transition; none of them replaces this.
 * The reducer those transitions live in is `terminal.ts`, and it is still not
 * here: this file computes what a served page says, once, and `cli/src/header.ts`
 * is the precedent -- a pure function of its answers, not a machine.
 *
 * The order on screen is the order a person would have seen it happen. Two
 * comments a human wrote, the command they typed, and then the binary's own
 * output -- which is quoted rather than described, everywhere it can be.
 */

/**
 * Re-exported rather than declared, since #85. They moved down to `lines.ts` so
 * that `commands.ts` could build the binary's prompt from them without
 * importing this module -- a leaf reaching back through its own composer. This
 * line is what keeps every existing import of them working from here.
 */
export { COMMENT, PROMPT, TYPED } from './lines'

/**
 * The menu, as the state of a widget rather than as rows.
 *
 * The rows below are drawn from this, and it is handed over beside them so that
 * `terminal.ts` knows the frame is live -- a menu the visitor can move and
 * answer, rather than a picture of one. It is the page's only caller of the
 * widget today; #91's install picker is the second, and opens its own.
 *
 * The cursor sits on the first entry, which is where the binary leaves it.
 */
const MENU: Open = { message: WHAT_NEXT, options: MENU_ENTRIES, cursor: 0 }

export const finished = (version: string): Session => ({
  lines: [
    // Both lifted verbatim from `README.md` through `content.ts`, and both set
    // as comments because the boot below has nowhere to put them: the binary's
    // header is a blank row, the mark and a version line, with no description
    // among them.
    //
    // The lede is one row and is left to wrap at the viewport rather than being
    // broken into several. Hard-wrapping it would be the page choosing a column
    // width for every screen; wrapping is what a narrow terminal does, and it
    // is the CLI's own rule -- a long line wraps rather than being cut.
    row(decoration(`${COMMENT} `), prose(hero.tagline)),
    row(decoration(`${COMMENT} `), prose(hero.lede)),

    blank(),
    row(decoration(`${PROMPT} `), ink(TYPED)),

    // No blank between the command and the boot. The header opens with one of
    // its own -- #68's row, which the CLI prints because its header is pinned
    // to the top of a terminal -- and a second here would be the double space
    // the CLI never writes.
    ...header(version),

    // The one `cli/src/pinned.ts` writes when it follows the header with two
    // newlines.
    blank(),

    ...asking(MENU),
  ],

  // Nothing here writes to a clipboard, moves focus or sets a timer, so there
  // is nothing to hand the renderer. #88 and #91 are the first to declare one.
  intents: [],

  // The boot ends on a question, so the session the page is served with is one
  // that is still waiting for an answer.
  open: MENU,
})
