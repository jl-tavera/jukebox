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
 * A Playlist, as far as calling it something goes.
 *
 * The structural shape rather than a `MirroredPlaylist`, so that the file every
 * command borrows its words from does not come to depend on the file that reads
 * the Mirror. It was written out three times before it was named -- in `labels`,
 * `ambiguous` and `askingToStop` -- which is a type asking to be born.
 */
export type Titled = { id: PlaylistId; title: string | null }

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
 * A name that found more than one Playlist.
 *
 * Each candidate is named as well as identified, and the naming is not
 * decoration. A title is matched by `sameness`, which folds case and strips the
 * quotes a screen prints -- so the two rows that collided can read visibly
 * differently, `"Chill"` against `"chill "`, and a list of bare ids would show a
 * reader neither the thing they typed nor the thing that answered to it.
 *
 * Refused rather than resolved, and the ids are here because this is the one
 * place a reader is shown them on purpose. `labels` prints an id on a `list` row
 * whose name has stopped identifying it, so a person who runs `list` will see
 * the collision before they hit this -- but a person who typed a name straight
 * from memory will not, and telling them to go and find an id without saying
 * which two are in play would be sending them back to look for something this
 * command is already holding.
 *
 * Shared by `show` and `remove` for `notTracked`'s reason: the same question of
 * the same table, and the same answer owed.
 */
export const ambiguous = (reference: string, playlists: readonly Titled[]): string =>
  [
    `${counted(playlists.length, 'playlist is', 'playlists are')} called ${reference}.`,
    'Name the one you mean by its id:',
    ...playlists.map((playlist) => `  ${identified(playlist.title, playlist.id)}`),
  ].join('\n')

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

/**
 * What is asked before anything is deleted.
 *
 * `named`, which is what every screen printing a Playlist now uses. The id used
 * to sit beside it and does not: `labels` prints one only where a name has
 * stopped identifying a Playlist.
 *
 * Here rather than in `menu.ts`, which owned it alone, because two things now
 * ask it. The menu asks before launching `remove` on a Playlist somebody
 * picked; `remove` asks for itself when it was given a title rather than a
 * handle. A second spelling of the same question is exactly the drift the top of
 * this file exists to prevent -- and worse here than anywhere, because the two
 * would be asked one screen apart about the same deletion.
 */
export const askingToStop = (playlist: Titled): string =>
  `Stop tracking ${named(playlist.title, playlist.id)}?`

/**
 * Two titles reduced to the one thing that decides whether they are the same
 * title.
 *
 * Exported because two places have to agree about it and would be a bug apart:
 * `labels` decides whether a name still identifies a Playlist, and
 * `playlistNamed` decides whether a name a person typed found one. A table
 * printing two rows as `"Chill"` while the lookup called them one string would
 * be showing a reader something they cannot act on.
 *
 * Case is folded, because a name is read off a screen and typed back by hand.
 * Surrounding quotes go, because the screen prints them and a copy takes them
 * with it. Whitespace goes, because a paste often brings some.
 *
 * A Playlist genuinely called `"Quoted"`, marks and all, is reachable by its id
 * and not by its name. That is the cost of stripping, it is a Source's own edge
 * case, and the alternative -- printing a name a reader cannot retype -- is
 * worse in the ordinary case rather than in a rare one.
 */
export const sameness = (title: string): string =>
  title
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .trim()
    .toLowerCase()

/**
 * What to call every Playlist in a list, where what one is called depends on
 * what the others are called.
 *
 * The whole set rather than a row at a time, and that is the point of it. A name
 * identifies a Playlist right up until a second Playlist has the same one, and
 * whether that has happened is not a fact any single row holds. So the id is
 * printed exactly where the name has stopped doing the identifying -- a title
 * the Source never offered, or one two rows share -- and nowhere else.
 *
 * It is the rule `playlistNamed` enforces from the other side, shown rather than
 * raised: a reader sees the collision in the table before they type a command
 * against it, instead of finding out from an error afterwards.
 *
 * Compared case-insensitively, because that is how a title is looked up. Two
 * Playlists called `Chill` and `chill` are one string to anybody typing, so a
 * table calling them both `"Chill"` would be showing two rows that a command
 * cannot tell apart.
 *
 * Taking the shape rather than a `MirroredPlaylist` for `held`'s reason: the
 * file every command borrows its words from does not depend on the one that
 * reads the Mirror.
 */
export const labels = (playlists: readonly Titled[]): Map<PlaylistId, string> => {
  const shared = new Map<string, number>()
  for (const { title } of playlists) {
    if (title === null) continue
    const folded = sameness(title)
    shared.set(folded, (shared.get(folded) ?? 0) + 1)
  }

  return new Map(
    playlists.map(({ id, title }) => [
      id,
      title !== null && (shared.get(sameness(title)) ?? 0) > 1
        ? identified(title, id)
        : named(title, id),
    ]),
  )
}

/**
 * What the Mirror holds for a Playlist, counted.
 *
 * The Removed count is mentioned only when there is one, the way `sync` names
 * only what moved -- `0 removed` is a phrase every reader has to read past on
 * every line to learn nothing.
 *
 * `no tracks` rather than `0 tracks` whenever the Mirror holds no row at all for
 * it, which is a Playlist that has not resolved yet and equally one whose Source
 * lists nothing. Both are the same sentence honestly: a zero invites the question
 * of what became of them, and in neither case were there ever any. Which of the
 * two it is, the status beside it already says.
 *
 * `list`'s own until #56, where the menu's Playlist picker had to say the same
 * thing about the same two numbers -- and a picker that phrased it differently
 * would be the drift ADR-0007 keeps the menu out of, on the one screen built to
 * show what `list` reported.
 *
 * The shape rather than a `MirroredPlaylist`, so that the file every command
 * borrows its words from does not come to depend on the file that reads the
 * Mirror. A caller passes the row and TypeScript takes the two fields it named.
 */
export const held = ({ tracks, removed }: { tracks: number; removed: number }): string =>
  tracks === 0 && removed === 0
    ? 'no tracks'
    : counted(tracks, 'track', 'tracks') + (removed === 0 ? '' : `, ${removed} removed`)
