import type { PlaylistId } from '@jukebox/schema'
import type { SourceName } from './sources/registry'

/**
 * D1 access for the `playlists` table, kept out of the routes so `index.ts`
 * stays about HTTP.
 */

/**
 * The four states the `status` column holds -- `CONTEXT.md`'s vocabulary, and
 * the comment on the column in migration 0001. Wider than the API's
 * `PlaylistStatus`, which only names the states a response can currently
 * carry, and narrows towards it as the remaining responses land.
 */
export type StoredStatus = 'pending' | 'ok' | 'unreachable' | 'gone'

/**
 * Records a Playlist as Pending, or leaves the one already there alone.
 *
 * `ON CONFLICT DO NOTHING` is untargeted, so it covers both the `id` primary
 * key and `UNIQUE (source, source_id)`; unlike `INSERT OR IGNORE` it does not
 * also swallow a `NOT NULL` violation. Re-adding a Playlist is therefore
 * harmless with no prior lookup and no chance of resetting a Playlist that has
 * already been resolved -- the property ADR-0001 chose a deterministic id for.
 *
 * `version` starts at 0: a Version names a snapshot, and the first one is
 * written by Resolution. `refresh_interval_s` is left unset, because DESIGN.md
 * keeps numbers needing real measurement blank rather than shipping a
 * plausible-looking constant for the next reader to copy.
 */
export const recordPending = async (
  db: D1Database,
  playlist: { id: PlaylistId; source: SourceName; sourceId: string; url: string },
): Promise<void> => {
  await db
    .prepare(
      `INSERT INTO playlists (id, source, source_id, url, version, status)
       VALUES (?, ?, ?, ?, 0, 'pending')
       ON CONFLICT DO NOTHING`,
    )
    .bind(playlist.id, playlist.source, playlist.sourceId, playlist.url)
    .run()
}

/**
 * Where a Playlist has got to, or `undefined` when nothing is tracking that id.
 * The caller has to tell those apart, so an untracked Playlist is not folded
 * into any state.
 */
export const readStatus = async (
  db: D1Database,
  id: PlaylistId,
): Promise<StoredStatus | undefined> => {
  const row = await db
    .prepare('SELECT status FROM playlists WHERE id = ?')
    .bind(id)
    .first<{ status: StoredStatus }>()

  return row?.status
}

