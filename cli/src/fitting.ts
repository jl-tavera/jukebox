/**
 * How a table is laid out, and what it gives up to fit a terminal.
 *
 * Split from `phrasing.ts` at the point that file stopped being one thing. Its
 * header claimed a single reason to exist -- the words more than one command
 * shares -- widened once, by #37, to cover what a command lays out as well.
 *
 * That widening was the crack. A table drifting by a space and a Playlist called
 * two different things are both drift, but they are not the same subject, and
 * this change would have added a third layer of geometry to a file about
 * wording.
 *
 * The seam was already named before it was cut. `columns` had one test file and
 * `fitted` was written into another called `fitting.test.ts`, which is a module
 * boundary announcing itself a commit early.
 *
 * Nothing here knows what a Playlist is. It takes rows of strings and a number
 * and answers with lines, which is what lets `config`, `list` and `show` share
 * it without sharing anything else.
 */

/**
 * Rows of cells, aligned into columns and indented.
 *
 * The last cell of a row is never padded, so a line carries no trailing
 * whitespace -- which is what a reader's editor would strip and a test's
 * `toBe` would then disagree about.
 *
 * Widths are measured across every row handed over at once, which is the whole
 * reason this takes a list rather than being called per row. `show` relies on
 * it: its present Tracks and its Removed ones are laid out together and split
 * into two blocks afterwards, so the two blocks line up with each other rather
 * than each being square on its own.
 *
 * Width is `String.length`, which is UTF-16 code units rather than the columns a
 * terminal will spend. A CJK title takes two columns per unit and an emoji takes
 * two for a surrogate pair, so either one leans the table. Left alone: getting it
 * right needs a grapheme table and an East-Asian-width table, both of which are
 * larger than this whole binary's rendering code, and the failure is a ragged
 * column rather than a wrong answer.
 */
export const columns = (rows: string[][]): string[] => {
  const widths: number[] = []

  for (const cells of rows) {
    cells.forEach((cell, at) => {
      widths[at] = Math.max(widths[at] ?? 0, cell.length)
    })
  }

  return rows.map((cells) =>
    (
      '  ' +
      cells
        .map((cell, at) => (at === cells.length - 1 ? cell : cell.padEnd(widths[at]!)))
        .join('   ')
    ).trimEnd(),
  )
}

/**
 * What a column gives up when the rows will not fit, and the order it gives it.
 *
 * A list rather than a property of each column, because the order is the whole
 * of the decision: which column yields *first* is what separates a table that
 * lost something it could spare from one that lost the thing its reader came
 * for.
 */
export type Move = { drop: number } | { trim: number; least: number }

/**
 * `columns`, given a terminal to fit inside.
 *
 * A separate function rather than a width added to `columns`, so that the two
 * callers laying out something that is not a track table -- `config` and `list`
 * -- keep the layout they have, provably rather than by inspection.
 */
export const fitted = (rows: string[][], width: number, moves: Move[]): string[] => {
  // Marked rather than spliced out, so that every index in `moves` still names
  // the column its author meant. Removing one would renumber the rest, and a
  // list whose later entries mean different things depending on which earlier
  // ones fired is the kind of thing that works until the order changes.
  const dropped = new Set<number>()
  const caps = new Map<number, number>()

  const shaped = (): string[][] =>
    rows.map((cells) =>
      cells
        .map((cell, at) => shorten(cell, caps.get(at)))
        .filter((_, at) => !dropped.has(at)),
    )

  const lay = (): string[] => columns(shaped())

  /** How wide one column is drawing right now, cut to whatever cap it has. */
  const spanOf = (at: number): number =>
    rows.reduce((most, cells) => Math.max(most, shorten(cells[at] ?? '', caps.get(at)).length), 0)

  let laid = lay()

  for (const move of moves) {
    // Recomputed each time round, because every move that fired changed it.
    // A deficit measured once would have the second move giving up what the
    // first had already found.
    const over = widest(laid) - width
    if (over <= 0) break

    // Exactly the overrun and no more, and never below the floor its author
    // set: a column cut past the point of being readable has spent a reader's
    // titles to buy nothing.
    if ('drop' in move) dropped.add(move.drop)
    else caps.set(move.trim, Math.max(move.least, spanOf(move.trim) - over))

    laid = lay()
  }

  return laid
}

/** Where a cut is marked. One column wide, unlike the three `...` would spend. */
const CUT = '…'

/**
 * One cell, cut to a cap it may not have.
 *
 * The trailing space goes before the mark does, so that a title cut at a word
 * boundary reads `Long Way…` rather than `Long Way …`. That leaves the cell
 * shorter than its cap, which costs nothing: `columns` pads it back.
 */
const shorten = (cell: string, cap: number | undefined): string =>
  cap === undefined || cell.length <= cap ? cell : cell.slice(0, cap - 1).trimEnd() + CUT

/** The row that decides whether the table fits, which is the longest one. */
const widest = (laid: string[]): number =>
  laid.reduce((most, line) => Math.max(most, line.length), 0)
