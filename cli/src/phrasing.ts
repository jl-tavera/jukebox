import type { PlaylistId } from '@jukebox/schema'

/**
 * The words more than one command says, written once.
 *
 * Both of these were private to `add` until #36 needed them too, and a second
 * copy is how two commands come to call the same Playlist different things --
 * one quoting a title and the other not, one saying `1 tracks`. Small enough to
 * duplicate and exactly the kind of thing that should not be.
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
