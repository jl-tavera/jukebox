import { decoration, dim, ink, inverted, row, type Line } from './lines'

/**
 * The menu, drawn the way the binary draws it.
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
 * `cursor` is a parameter rather than a constant because the frame cannot place
 * its hint without knowing which row is active. #86 makes that number move;
 * nothing about this signature changes when it does.
 */

/** The rail, and the corner that closes it. */
export const BAR = '\u2502'
export const BAR_END = '\u2514'

/** The mark on the question, for a step that is waiting on an answer. */
export const STEP = '\u25C6'

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

export interface Option {
  label: string
  hint: string
}

export const select = (message: string, options: readonly Option[], cursor: number): Line[] => [
  // The rail opens a row above the question, which is what joins this block to
  // whatever the terminal printed before it.
  row(decoration(BAR)),
  row(decoration(`${STEP}  `), ink(message)),

  ...options.map((option, index) =>
    index === cursor
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
      : row(decoration(`${BAR}  `), decoration(`${RADIO_INACTIVE} `), dim(option.label)),
  ),

  row(decoration(`${BAR}  `), dim(LEGEND)),
  row(decoration(BAR_END)),
]
