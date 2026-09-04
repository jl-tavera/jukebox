import { hero, MENU_ENTRIES, WHAT_NEXT, type System } from '../content'
import { header } from './header'
import { elsewhere, offering, SYSTEMS } from './install'
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
 * answer, rather than a picture of one. It was the page's only caller of the
 * widget until #91, whose install picker is the second and opens its own from
 * `install.ts` without either of them changing the widget.
 *
 * The cursor sits on the first entry, which is where the binary leaves it.
 */
const MENU: Open = { message: WHAT_NEXT, options: MENU_ENTRIES, cursor: 0 }

/**
 * Whose install command a page served to nobody in particular carries.
 *
 * The first system of the first command, so it is `README.md`'s lead rather
 * than a name written here -- and the curl line rather than the PowerShell one,
 * because #79's complaint about the old page was that two install rows
 * dominated it, and a served page showing both so that one can be taken away
 * would put that back for as long as hydration takes.
 *
 * A static export cannot know who is reading it, so this is what a crawler, a
 * browser whose JavaScript failed and the first paint of every visit all get.
 * `terminal.ts` swaps it for the visitor's own on a guess, and `install` reaches
 * all three when the guess is wrong.
 */
const SERVED: System = SYSTEMS[0]!

export const finished = (version: string, system: System = SERVED): Session => ({
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

    // The page's first job, done before the page has finished arriving. It sits
    // above the boot because `boot.ts` replays from the `$ jukebox` line
    // downwards -- so this is on screen in the first frame rather than a second
    // and a half later -- and because it could not sit below it in any case:
    // `terminal.ts` reads the open frame off the tail of the session, so the
    // menu has to be the last thing here.
    blank(),
    ...offering(system),
    elsewhere(),

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

  // **Still nothing, and #91 arriving is what makes that a decision.** The page
  // now has a command on it and a control that copies it, and it does not use
  // either on the visitor's behalf: a clipboard nobody reached for is not the
  // page's to write. Every intent this module can produce comes from something
  // somebody did.
  intents: [],

  // The boot ends on a question, so the session the page is served with is one
  // that is still waiting for an answer.
  open: MENU,
})
