import type { PlaylistId } from '@jukebox/schema'

/**
 * The words and the shapes more than one command shares, written once.
 *
 * `named` and `counted` were private to `add` until #36 needed them too, and a
 * second copy is how two commands come to call the same Playlist different
 * things -- one quoting a title and the other not, one saying `1 tracks`. Small
 * enough to duplicate and exactly the kind of thing that should not be.
 *
 * #37 widened it from words to what a command lays out as well. `columns` was
 * `config`'s alone and three commands want it; a table drawn twice is a table
 * that drifts by a space. The header used to say "the words", and it says this
 * now because the reason has always been the drift rather than the grammar.
 */

/**
 * What to call a Playlist on screen.
 *
 * The id is the fallback, and `CONTEXT.md` is why there is no third option: a
 * title is absent where the Source offers nothing usable, "never a placeholder,
 * which nobody downstream could tell from a real title".
 */
export const named = (title: string | null, id: PlaylistId): string =>
  title === null ? id : `"${title}"`

export const counted = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

/**
 * A Mirror with nothing in it, said out loud.
 *
 * `sync`'s until `list` needed the same sentence. Both are commands that can
 * correctly have nothing to report, and a command that wrote nothing at all
 * reads as a command that failed silently -- so both say this rather than
 * printing an empty report, and they say it identically.
 */
export const NOTHING_TRACKED = 'Nothing is tracked yet. Add a playlist with `jukebox add <url>`.'

/**
 * A moment, in the reader's own timezone, to the minute.
 *
 * Local rather than UTC because every timestamp the CLI prints is about
 * something that happened on this machine, and an offset the reader has to
 * apply in their head is one they will apply wrongly. To the minute because
 * nothing here happens twice in one, and a column of seconds is a column
 * nobody reads.
 *
 * Built by hand rather than through `toLocaleString`, whose output depends on
 * the host's locale: the same Mirror would print two different orderings of the
 * same date on two machines, and a test could only assert on whichever one CI
 * happened to have.
 */
export const stamp = (at: number): string => {
  const when = new Date(at)
  const padded = (value: number): string => String(value).padStart(2, '0')

  return (
    `${when.getFullYear()}-${padded(when.getMonth() + 1)}-${padded(when.getDate())} ` +
    `${padded(when.getHours())}:${padded(when.getMinutes())}`
  )
}

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
 * How many entries a Source offered that never became Tracks.
 *
 * Always said, including when it is none, so that its absence never has to be
 * interpreted: a count lower than the one the Source shows must not read as
 * data loss, and a Skipped entry leaves nothing on the screen to notice. `add`'s
 * until `show` needed the same sentence about the same number.
 */
export const skippedly = (skipped: number): string =>
  skipped === 0 ? 'nothing skipped' : `${counted(skipped, 'entry', 'entries')} skipped`

/**
 * The Mirror was asked about a Playlist it does not hold.
 *
 * Shared by `show` and `remove`, which ask the same question of the same table
 * and owe the same answer -- one of them phrasing it differently would read as
 * two different problems.
 *
 * The middle line only where the reference looks like an address, because that
 * is the only case where the reader may be right and Jukebox still cannot find
 * it: the URL is matched as the exact string `add` recorded, so the same
 * Playlist pasted a second time with a tracking parameter on it genuinely
 * misses. Left unsaid, that reads as "you do not track this" when the truth is
 * "not by that name".
 */
export const notTracked = (reference: string): string =>
  [
    `Jukebox is not tracking ${reference} on this machine.`,
    ...(reference.includes('://')
      ? ['Addresses are matched exactly as they were typed when the playlist was added.']
      : []),
    'Run `jukebox list` to see what is tracked.',
  ].join('\n')

/**
 * What to call a Playlist where the reader may want to act on it next.
 *
 * `named` plus the handle, because `show` and `remove` both print a heading
 * above a Playlist somebody is deciding something about, and the id is the
 * string the next command takes. A Playlist with no title is its id once rather
 * than its id twice.
 *
 * Shared for the reason at the top of this file, and this one had a copy in each
 * of those two commands before it was: `remove`'s said "as `show` does it, so
 * the two commands agree on a Playlist", which is an argument for one of these
 * rather than for two that happen to match today.
 */
export const identified = (title: string | null, id: PlaylistId): string =>
  title === null ? id : `${named(title, id)} (${id})`
