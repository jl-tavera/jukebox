import type { PlaylistId } from '@jukebox/schema'
import type { SourceName } from './sources/registry'

/**
 * D1 access for the `playlists` table, kept out of the routes so `index.ts`
 * stays about HTTP.
 */

/**
 * The four states the `status` column holds -- `CONTEXT.md`'s vocabulary, and
 * the comment on the column in migration 0001.
 *
 * Wider than the API's `PlaylistStatus`, and permanently so. A response carries
 * a status when it has something to hand over or something to wait for;
 * Unreachable and Gone have neither, so they reach a caller as an error code it
 * can branch on rather than as a state described in a success body. The two
 * types name different things and are not converging.
 */
export type StoredStatus = 'pending' | 'ok' | 'unreachable' | 'gone'

/**
 * Records a Playlist as Pending, or leaves the one already there alone.
 * Answers whether this call is the one that started tracking it.
 *
 * `ON CONFLICT DO NOTHING` is untargeted, so it covers both the `id` primary
 * key and `UNIQUE (source, source_id)`; unlike `INSERT OR IGNORE` it does not
 * also swallow a `NOT NULL` violation. Re-adding a Playlist is therefore
 * harmless with no prior lookup and no chance of resetting a Playlist that has
 * already been resolved -- the property ADR-0001 chose a deterministic id for.
 *
 * `RETURNING` yields a row only when the insert happened, so one statement both
 * records the Playlist and tells the caller whether to ask for a Resolution.
 * A lookup first would answer the same question and cost a second round trip to
 * do it, and would still be racing the insert.
 *
 * `version` starts at 0: a Version names a snapshot, and the first one is
 * written by Resolution. `refresh_interval_s` is left unset, because DESIGN.md
 * keeps numbers needing real measurement blank rather than shipping a
 * plausible-looking constant for the next reader to copy.
 */
export const recordPending = async (
  db: D1Database,
  playlist: { id: PlaylistId; source: SourceName; sourceId: string; url: string },
): Promise<{ newlyTracked: boolean }> => {
  const inserted = await db
    .prepare(
      `INSERT INTO playlists (id, source, source_id, url, version, status)
       VALUES (?, ?, ?, ?, 0, 'pending')
       ON CONFLICT DO NOTHING
       RETURNING id`,
    )
    .bind(playlist.id, playlist.source, playlist.sourceId, playlist.url)
    .first<{ id: PlaylistId }>()

  return { newlyTracked: inserted !== null }
}

/**
 * Where a Playlist has got to, and the Version it got there at. `undefined`
 * when nothing is tracking that id: the caller has to tell that apart from any
 * state, so an untracked Playlist is not folded into one.
 *
 * Both come off one row, so the Version costs a caller that wants only the
 * status nothing -- no second statement, no second round trip. `version` is 0
 * until a Resolution writes one, which is what `recordPending` inserts.
 */
export interface StoredPlaylist {
  status: StoredStatus
  version: number
}

export const readStatusAndVersion = async (
  db: D1Database,
  id: PlaylistId,
): Promise<StoredPlaylist | undefined> => {
  const row = await db
    .prepare('SELECT status, version FROM playlists WHERE id = ?')
    .bind(id)
    .first<StoredPlaylist>()

  return row ?? undefined
}

/**
 * What a snapshot needs beyond its Tracks, for a Version that has to be rebuilt
 * because the cache no longer holds it.
 *
 * Three of the four can be `null`, and each `null` is a refusal rather than a
 * gap to paper over.
 *
 * `skipped` is absent for a Playlist resolved before migration 0004 added the
 * column. It is the one part of a snapshot nothing else in D1 could
 * reconstruct, so without it this Version cannot be rebuilt honestly.
 *
 * `membershipVersion` is which Version the `playlist_tracks` rows reflect,
 * which is not the same question as which Version the Playlist is serving.
 * Absent when those rows reflect no Version anybody can name -- see migration
 * 0004 for the two ways that happens.
 */
export interface ResolvedPlaylist {
  version: number
  title: string | null
  skipped: number | null
  membershipVersion: number | null
}

/** What the row says the Playlist was last resolved to, or `undefined` for none. */
export const readResolved = async (
  db: D1Database,
  id: PlaylistId,
): Promise<ResolvedPlaylist | undefined> => {
  const row = await db
    .prepare(
      `SELECT version, title, skipped, membership_version AS membershipVersion
         FROM playlists WHERE id = ?`,
    )
    .bind(id)
    .first<ResolvedPlaylist>()

  return row ?? undefined
}

/**
 * What a Resolution needs to know about a Playlist before it starts. The queue
 * message carries only an id, so this is where a Resolution learns which Source
 * to reach and which Version it is moving on from.
 */
export interface TrackedPlaylist {
  source: SourceName
  sourceId: string
  version: number
}

/** A tracked Playlist, or `undefined` when nothing is tracking that id. */
export const readTracked = async (
  db: D1Database,
  id: PlaylistId,
): Promise<TrackedPlaylist | undefined> => {
  const row = await db
    .prepare('SELECT source, source_id AS sourceId, version FROM playlists WHERE id = ?')
    .bind(id)
    .first<TrackedPlaylist>()

  return row ?? undefined
}

/**
 * Moves a Playlist to the Version a Resolution just wrote, to the name it just
 * read, and to the count of what it could not make Tracks of.
 *
 * One statement, because they are one row catching up to one Resolution. A
 * title written by a second statement could be the one a different attempt
 * read, and a title written by no statement at all would leave the column that
 * has had a name to hold since migration 0001 still holding nothing.
 *
 * `skipped` is here rather than anywhere else for a reason the other three do
 * not have: it is the only part of a snapshot D1 could not otherwise
 * reconstruct, so a Version recorded without it is a Version nothing can
 * rebuild. Migration 0004 says the rest.
 *
 * Named rather than four positionals: `version`, `skipped` and `at` are all
 * numbers, and nothing but the argument's place would say which was which.
 *
 * Called last, after the snapshot is written and head names it. A row saying
 * `ok` at a Version the cache cannot serve would be a Playlist the Tracks
 * endpoint has no honest answer for, so D1 catches up with KV rather than
 * running ahead of it.
 */
export const markResolved = async (
  db: D1Database,
  id: PlaylistId,
  resolved: { version: number; title: string | null; skipped: number; at: number },
): Promise<void> => {
  await db
    .prepare(
      `UPDATE playlists
          SET version = ?, title = ?, skipped = ?, status = 'ok', last_refreshed_at = ?
        WHERE id = ?`,
    )
    .bind(resolved.version, resolved.title, resolved.skipped, resolved.at, id)
    .run()
}

/**
 * Records a Resolution that ended without Tracks.
 *
 * No Version and no `last_refreshed_at`: neither moved, because nothing was
 * read. What the Playlist was serving before, if anything, it goes on serving
 * -- these two states are answers for a Playlist that has never had a Version,
 * and a Playlist that has one is served from its snapshot either way.
 */
const markFailed = (db: D1Database, id: PlaylistId, status: 'gone' | 'unreachable') =>
  db.prepare('UPDATE playlists SET status = ? WHERE id = ?').bind(status, id).run()

/** The Source refuses this Playlist, and asking again will not change that. */
export const markGone = async (db: D1Database, id: PlaylistId): Promise<void> => {
  await markFailed(db, id, 'gone')
}

/** The Source could not be read, for a reason worth trying again. */
export const markUnreachable = async (db: D1Database, id: PlaylistId): Promise<void> => {
  await markFailed(db, id, 'unreachable')
}
