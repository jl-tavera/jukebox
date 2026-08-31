import type { PlaylistId } from '@jukebox/schema'
import type { Mirror } from './mirror'
import type { MirrorStatus } from './tracking'

/**
 * What the Mirror is asked, which is the half `tracking.ts` is not.
 *
 * The line between them is who is asking rather than which verb the SQL uses. A
 * read a write needs in order to be correct lives beside that write; a read
 * somebody wants an answer to lives here. `mirror.ts` named this split before
 * either side of it existed -- "`tracking.ts` owns the writes and #37 will own
 * the reads".
 *
 * Every row is mapped to camelCase on the way out, so that a column renamed in
 * a migration is renamed in one file rather than in every command that prints
 * it. That is the same boundary `tracking.ts` keeps in the other direction.
 */

/**
 * A Playlist as the Mirror holds it, with what it holds for it counted.
 *
 * The counts are two rather than one because a Removed Track is still a row: the
 * Mirror keeps it, along with the moment it left, and that record is the only
 * thing that knows a Track was there last week. A single total would hide it and
 * a single present count would make `show` look like it had invented rows.
 *
 * The whole row, not the four fields `list` prints. There is no other way for a
 * script to read the Mirror -- no second command, no export -- so a field left
 * out here is a field nobody can reach. ADR-0005 is what makes adding the rest
 * later cheap and leaving them out now merely unhelpful.
 */
export type MirroredPlaylist = {
  id: PlaylistId
  url: string
  title: string | null
  status: MirrorStatus
  /** Where its files will go once Fetching exists, per ADR-0004. */
  folderName: string | null
  /** The Version last seen, and `null` for a Playlist that has never resolved. */
  lastVersion: number | null
  /** Entries its Source offered that never became Tracks, and `null` until it resolved. */
  skipped: number | null
  lastSyncedAt: number | null
  /** Tracks its Source still lists. */
  tracks: number
  /** Tracks its Source no longer lists, whose rows the Mirror keeps. */
  removed: number
}

/** A Track as the Mirror holds it. `removedAt` is `null` while the Source still lists it. */
export type MirroredTrack = {
  trackId: string
  title: string
  artists: string[]
  album: string | null
  durationMs: number | null
  isrc: string | null
  coverImageUrl: string | null
  position: number
  addedAt: number
  removedAt: number | null
}

/**
 * The row `status` is narrowed to the four rather than read as a string.
 *
 * Trusted on the same grounds `trackedPlaylists` trusts `id` to be a
 * `PlaylistId`: `tracking.ts` writes this column and writes nothing else into
 * it, so a fifth value in a Mirror is a Mirror somebody edited by hand.
 */
type PlaylistRow = {
  id: PlaylistId
  url: string
  title: string | null
  status: MirrorStatus
  folder_name: string | null
  last_version: number | null
  skipped: number | null
  last_synced_at: number | null
  tracks: number
  removed: number
}

/**
 * The counts come off a `LEFT JOIN` rather than two subqueries, so a Playlist
 * with no Tracks at all still answers -- with zeroes, which is exactly what a
 * Pending one should read as.
 *
 * `FILTER` rather than `SUM(CASE ...)`: it says what it means, it cannot return
 * `NULL` over an empty group the way `SUM` does, and SQLite has answered it
 * since 3.30.
 */
const PLAYLISTS = `
  SELECT p.id, p.url, p.title, p.status, p.folder_name,
         p.last_version, p.skipped, p.last_synced_at,
         COUNT(t.track_id) FILTER (WHERE t.removed_at IS NULL)     AS tracks,
         COUNT(t.track_id) FILTER (WHERE t.removed_at IS NOT NULL) AS removed
    FROM playlists p
    LEFT JOIN tracks t ON t.playlist_id = p.id`

const asPlaylist = (row: PlaylistRow): MirroredPlaylist => ({
  id: row.id,
  url: row.url,
  title: row.title,
  status: row.status,
  folderName: row.folder_name,
  lastVersion: row.last_version,
  skipped: row.skipped,
  lastSyncedAt: row.last_synced_at,
  tracks: row.tracks,
  removed: row.removed,
})

/**
 * Every Playlist this Mirror holds, in a fixed order.
 *
 * `ORDER BY id` for the reason `trackedPlaylists` gives: two runs over one
 * Mirror must read the same way, and there is nothing better to sort by -- a
 * title may be absent, and nothing records when a Playlist was added.
 */
export const mirroredPlaylists = (mirror: Mirror): MirroredPlaylist[] =>
  mirror
    .query<PlaylistRow, []>(`${PLAYLISTS} GROUP BY p.id ORDER BY p.id`)
    .all()
    .map(asPlaylist)

/**
 * The one Playlist a person named, or `null` for a name this Mirror does not
 * hold.
 *
 * Either the id or the URL, because both are things a user has in front of
 * them: `list` prints the id, and the URL is what they pasted into `add`. One
 * `OR` rather than a branch that decides which was meant, because deciding
 * would mean recognising a URL -- and recognising a URL is the Source adapter's
 * job on the worker, which is precisely what the CLI is not allowed to
 * duplicate.
 *
 * The URL is matched as the exact string `add` recorded. Nothing is normalized,
 * for that same reason, so an address that gained a tracking parameter since it
 * was pasted will not be found. The commands pay for that in their copy rather
 * than here: a miss that looks like a URL says that addresses match as typed,
 * and points at `list`.
 *
 * `id` wins where both could match. `id` is the primary key and `url` carries no
 * constraint at all, so two rows can satisfy the `OR` -- one Playlist whose id
 * is the string, another whose URL is -- and `.get()` would otherwise answer
 * with whichever the query planner reached first. Unreachable in practice and a
 * single clause to make impossible.
 */
export const playlistNamed = (mirror: Mirror, reference: string): MirroredPlaylist | null => {
  const row = mirror
    .query<PlaylistRow, [string, string, string]>(
      `${PLAYLISTS} WHERE p.id = ? OR p.url = ? GROUP BY p.id ORDER BY (p.id = ?) DESC LIMIT 1`,
    )
    .get(reference, reference, reference)

  return row === null ? null : asPlaylist(row)
}

type TrackRow = {
  track_id: string
  title: string
  artists: string
  album: string | null
  duration_ms: number | null
  isrc: string | null
  cover_image_url: string | null
  position: number
  added_at: number
  removed_at: number | null
}

/**
 * What one Playlist holds, in two lists: the Tracks its Source still lists, and
 * the Removed ones whose rows the Mirror keeps.
 *
 * Two lists rather than one flagged list, in the data as well as on screen. It
 * is the same pair of words `list` counts, so a caller that understands
 * `tracks` and `removed` there understands them here; and it spares every reader
 * of the JSON the filter that the human rendering has already done.
 */
export type MirroredTracks = { tracks: MirroredTrack[]; removed: MirroredTrack[] }

/**
 * One Playlist's Tracks, read whole and split.
 *
 * Removed Tracks are read rather than filtered out, which is the whole of "shown
 * and distinguished, not hidden". They are kept apart from the present ones
 * because their `position` is a fossil: it is where the Track was when it left,
 * and a present Track may hold that number now. One list ordered by position
 * would put two Tracks at the same index and claim both were there.
 *
 * One query, because the split is an ordering. `removed_at IS NOT NULL` sorts as
 * 0 and 1, so the present Tracks come first, and `position` then orders each
 * block. Both by position, because the acceptance criterion asks for Source
 * order and that is what `position` is -- for the Removed it is the last order
 * the Source put them in, which is still that Source's and still the order the
 * Playlist reads in. When each left is on its row rather than in the sort.
 *
 * `track_id` is the last word. Nothing constrains two Tracks to distinct
 * positions, and after a Track leaves, the one that takes its place holds the
 * same number -- so without it, two rows could swap between runs.
 *
 * The partial index answers neither half of this, and that is expected. It
 * covers the present-only read `applySnapshot` makes on every Sync, which is the
 * hot one; this runs when a person asks.
 */
export const mirroredTracks = (mirror: Mirror, id: PlaylistId): MirroredTracks => {
  const rows = mirror
    .query<TrackRow, [PlaylistId]>(
      `SELECT track_id, title, artists, album, duration_ms, isrc, cover_image_url,
              position, added_at, removed_at
         FROM tracks
        WHERE playlist_id = ?
        ORDER BY removed_at IS NOT NULL, position, track_id`,
    )
    .all(id)
    .map(asTrack)

  return {
    tracks: rows.filter((row) => row.removedAt === null),
    removed: rows.filter((row) => row.removedAt !== null),
  }
}

const asTrack = (row: TrackRow): MirroredTrack => ({
  trackId: row.track_id,
  title: row.title,
  // Parsed without a guard, for the reason `sourceOf` has none: the column is
  // written by one statement in one function, and that statement always writes
  // `JSON.stringify` of an array. A parse that throws here is a Mirror somebody
  // edited by hand, and `main`'s catch-all is where that belongs -- a fallback
  // would answer with an artist list the Track does not have.
  artists: JSON.parse(row.artists) as string[],
  album: row.album,
  durationMs: row.duration_ms,
  isrc: row.isrc,
  coverImageUrl: row.cover_image_url,
  position: row.position,
  addedAt: row.added_at,
  removedAt: row.removed_at,
})
