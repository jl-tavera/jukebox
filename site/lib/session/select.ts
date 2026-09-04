import {
  decoration,
  dim,
  ink,
  inverted,
  row,
  struck,
  type Line,
  type Open,
  type Span,
} from './lines'

/**
 * A select, drawn the way the binary's own is.
 *
 * Everywhere else this page quotes the CLI: the wordmark is generated from the
 * same banner, the version line is read from the same package. The menu is the
 * exception, because the CLI does not draw it either -- `@clack/prompts` does,
 * by writing escape sequences to a stream, which is not a thing a page can run.
 * So this reproduces the frame that library draws.
 *
 * That makes it the one place on the page where getting a detail wrong turns a
 * quotation into an impersonation, and #86 names the two details that decide
 * it. **The hint belongs to the active row only** -- the library shows it for
 * the row the cursor is standing on and for none of the others. **The closing
 * bar is a footer**, carrying the navigation legend, rather than the last
 * option with a corner on it.
 *
 * **The colour is not reproduced, and that is a decision rather than an
 * omission.** The library paints the rail cyan and the active radio green.
 * Those are the library's colours; the CLI uses exactly one colour in its whole
 * program and prints a status as its stored word rather than as a hue, because
 * colour is gone under `NO_COLOR`, gone in a redirected stream and gone on a
 * terminal that has none. ADR-0010 settles the same question for the page: the
 * rail's *shape* is what identifies it, so the shape is exact and the palette
 * is untouched. No accent token exists to reach for.
 *
 * **Nothing here is the menu's.** #86 made the widget move and #91 opens a
 * second one for the install command, so every function below takes an `Open`
 * and knows nothing about what is being asked. The menu is one caller of it,
 * assembled in `index.ts` out of `content.ts`.
 */

/** The rail, and the corner that closes it. */
export const BAR = '\u2502'
export const BAR_END = '\u2514'

/**
 * The three marks a step wears, which are how the library says what became of
 * the question rather than what was answered.
 *
 * It paints them too -- cyan while asking, green on a submit, red on a cancel --
 * and the page takes the glyphs and leaves the paint, the same trade the rail
 * makes one comment up. With the colour gone the mark is the whole of the
 * signal, which is exactly why all three are here rather than only the first.
 */
export const STEP = '\u25C6'
export const STEP_DONE = '\u25C7'
export const STEP_LEFT = '\u25A0'

/** Chosen, and not chosen. Two shapes, so the difference survives with no colour. */
export const RADIO_ACTIVE = '\u25CF'
export const RADIO_INACTIVE = '\u25CB'

/**
 * What the footer says.
 *
 * The library carries two legends and this is the shorter one, which is the
 * only one a `select` shows -- the three-item version naming `Space` belongs to
 * `multiselect`, where there is something to toggle. `cli/src/menu.ts` calls
 * `select`, so a page showing the longer one would be advertising a keystroke
 * the real menu ignores.
 */
export const LEGEND = '\u2191/\u2193 to navigate \u2022 Enter: confirm'

/**
 * The frame while the question is still open.
 *
 * `cursor` travels inside the `Open` rather than beside it because the frame
 * cannot place its hint without knowing which row is active, and #86 makes that
 * number move -- so the state and the drawing of it are one argument, and
 * `terminal.ts` never has to keep the two in step by hand.
 */
export const asking = (open: Open): Line[] => [
  // The rail opens a row above the question, which is what joins this block to
  // whatever the terminal printed before it.
  row(decoration(BAR)),
  row(decoration(`${STEP}  `), ink(open.message)),

  ...open.options.map((_, index) => offer(open, index)),

  row(decoration(`${BAR}  `), dim(LEGEND)),
  row(decoration(BAR_END)),
]

/**
 * One option's row, active or not.
 *
 * Split out of the frame above because two things need it and only one of them
 * is drawing: `active` below hands the same row to a live region, and deriving
 * that from an index into the finished frame would make a screen reader's
 * announcement depend on how many rows the header happens to have.
 */
const offer = (open: Open, index: number): Line => {
  const option = open.options[index]!

  return index === open.cursor
    ? row(
        decoration(`${BAR}  `),
        decoration(`${RADIO_ACTIVE} `),
        // The one inverted span on the page. #79 gives the block cursor a
        // single job -- it is the only pointer this design has -- and on a
        // menu the cursor is the selected row's inversion. It sits on the
        // label rather than the whole row because every cursor-landable thing
        // here is a word.
        inverted(option.label),
        dim(` (${option.hint})`),
      )
    : row(decoration(`${BAR}  `), decoration(`${RADIO_INACTIVE} `), dim(option.label))
}

/**
 * The row the cursor is standing on.
 *
 * What a live region is given when a key moves the selection: the label and the
 * hint, with the rail and the radio dropped on the way out by `spoken`, because
 * they are the frame rather than the answer.
 */
export const active = (open: Open): Line => offer(open, open.cursor)

/**
 * The frame an answered question leaves behind.
 *
 * The library redraws the whole block on a submit and keeps almost none of it:
 * the step's mark changes, one rail row carries the chosen label on its own, and
 * the other options, the radios, the hint, the legend and the corner all go.
 * That is not decoration -- what follows a submitted question is whatever the
 * answer ran, and a legend still offering to navigate would be offering to move
 * something that is over.
 *
 * Nothing is inverted here. The inversion is this page's cursor, and the cursor
 * has left.
 */
export const answered = (open: Open): Line[] =>
  closing(open, STEP_DONE, dim(open.options[open.cursor]!.label))

/**
 * The frame a question that was walked away from leaves behind.
 *
 * The library's cancel, which is what Ctrl-C draws at the real menu -- and
 * `cli/src/menu.ts` says a cancel leaves the same way `quit` does, so the page
 * treats the two as the same gesture with two different records of it. The
 * value the cursor was standing on is struck through, and one bare rail row
 * closes the block.
 *
 * **The strikethrough is kept where the colour is dropped**, and the line
 * between those two is worth stating: the library paints this mark red, and red
 * is gone for the same reason cyan and green are. A strikethrough is not a
 * colour -- it survives `NO_COLOR`, it survives a terminal with no palette, and
 * without it an abandoned frame and an answered one differ by one glyph. It is
 * part of the shape, so it stays.
 */
export const abandoned = (open: Open): Line[] => [
  ...closing(open, STEP_LEFT, struck(open.options[open.cursor]!.label)),

  // The one row that is not shared. The library leaves a bare rail under a
  // cancel and none under a submit, and the difference is not decoration: what
  // follows a submit is whatever the answer ran, and what follows a cancel is
  // whatever the person did instead.
  row(decoration(BAR)),
]

/**
 * What both endings have in common: the rail, the mark, and one row carrying
 * the value the question closed on.
 *
 * Written once because the two differ in exactly two things -- which mark, and
 * how the value is drawn -- and a reader comparing them should see only that.
 */
const closing = (open: Open, mark: string, value: Span): Line[] => [
  row(decoration(BAR)),
  row(decoration(`${mark}  `), ink(open.message)),
  row(decoration(`${BAR}  `), value),
]

/**
 * The cursor, one row on, and **it wraps**.
 *
 * `findCursor` in `@clack/core` lands on the first row when it walks off the
 * last and on the last when it walks off the first, and the page does the same
 * because the widget it is quoting does. It is not a detail nobody would meet:
 * the way out is the fifth of five entries, so wrapping is the difference
 * between one keystroke and four.
 *
 * The library's version also steps over disabled rows. There are none here --
 * `Option` cannot express one -- and inventing the field to reproduce the skip
 * would be reproducing a branch nothing on this page can reach.
 */
export const moved = (open: Open, by: 1 | -1): Open => ({
  ...open,
  cursor: (open.cursor + by + open.options.length) % open.options.length,
})

/**
 * The row a word names, or `undefined`.
 *
 * What makes a typed word an answer rather than a command. A visitor reading
 * five words on screen and typing one of them means the row, and this is also
 * the only way `quit` can mean anything at a prompt where it is not a command
 * -- the menu offers it, so the page has to answer for it.
 *
 * It matches the **label**, not what the row runs. The label is the word on
 * screen and so the only one a visitor could have read; #91's rows read `macos`
 * and run something considerably longer than that.
 */
export const named = (open: Open, word: string): number | undefined => {
  const at = open.options.findIndex((option) => option.label === word)
  return at < 0 ? undefined : at
}

/**
 * How many rows the open frame occupies, which is what a caller redrawing it
 * has to replace.
 *
 * Counted off the frame rather than computed from the options, so it cannot
 * disagree with what `asking` actually draws -- a widget that grew a row and an
 * arithmetic that did not would leave a stray legend on the screen.
 */
export const height = (open: Open): number => asking(open).length
