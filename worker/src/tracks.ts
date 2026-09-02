import type { PlaylistId } from '@jukebox/schema'
import type { NormalizedTrack, SourceName } from './sources/registry'
import { trackId } from './sources/registry'

/**
 * D1 access for `tracks` and `playlist_tracks`. D1 is the canonical store and
 * is read on the cold path only -- it exists so the KV snapshots can be
 * rebuilt, which is why what is written here has to be lossless.
 */

/** A Track currently in a Playlist, as `playlist_tracks` records it. */
interface Present {
  track_id: string
  position: number
}

/**
 * Which Tracks a Playlist currently holds, and where.
 *
 * The index migration 0003 created is the one this read wants -- it said so at
 * the time, and this is the read it meant. So the constraint that stops a Track
 * being present twice and the index that answers this question are the same
 * object, rather than one bolted on beside the other.
 */
const presentIn = async (db: D1Database, playlistId: PlaylistId): Promise<Present[]> => {
  const { results } = await db
    .prepare(
      'SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? AND removed_at IS NULL',
    )
    .bind(playlistId)
    .all<Present>()

  return results
}

/**
 * Records a Resolution's Tracks and their membership of the Playlist, and makes
 * that membership current: a Track the Source no longer lists is marked
 * Removed, and one that moved is re-placed where it now is.
 *
 * It reads before it writes, which is what makes the difference expressible at
 * all. Migration 0003 wrote membership add-only and said so, on the grounds
 * that nothing read these rows; issue #25's rebuild is what reads them, so an
 * add-only membership would now have a reader served a superset of the
 * Playlist at stale positions -- under an ETag naming an immutable Version.
 * ADR-0008 records what that reverses and what is still Refresh's.
 *
 * `ON CONFLICT DO NOTHING` on `tracks` because a Track is shared: two Playlists
 * can hold the same recording, and the second Resolution to reach it should
 * leave the row alone rather than fail or rewrite it. It stays on
 * `playlist_tracks` too, where it now guards something narrower than it used
 * to: a Track this Resolution believes is new, which a redelivery of the same
 * Resolution already recorded.
 *
 * `at` is passed in rather than read here so that everything one Resolution
 * writes carries the same instant -- the moment a Track joined, and the moment
 * another left. Unix seconds, matching `refresh_interval_s`.
 *
 * `version` is what these rows will reflect once they are written, and it is
 * stamped on the Playlist in the same batch. It is not the Version the Playlist
 * is *serving* -- that is `markResolved`'s, and it is written two steps later,
 * so the two come apart exactly when an attempt dies in between. A rebuild
 * compares them, which is the only way it can tell membership that has run
 * ahead of the document describing it from membership that matches.
 */
export const recordTracks = async (
  db: D1Database,
  playlistId: PlaylistId,
  source: SourceName,
  tracks: NormalizedTrack[],
  at: number,
  version: number,
): Promise<void> => {
  // Keyed by the id the row is stored under, and the first occurrence wins. A
  // Source may offer the same recording twice in one Playlist; migration 0003
  // says a Track is in a Playlist at most once at a time, and the entry that
  // decides where it sits is the earlier one -- which is the same one the
  // add-only write kept, since its insert was the one that succeeded.
  const offered = new Map<string, NormalizedTrack>()
  for (const track of tracks) {
    const id = trackId(source, track.sourceTrackId)
    if (!offered.has(id)) offered.set(id, track)
  }

  const present = await presentIn(db, playlistId)
  const placed = new Map(present.map((row) => [row.track_id, row.position]))

  const track = db.prepare(
    `INSERT INTO tracks
       (id, source, source_track_id, title, artists, album, duration_ms, isrc, cover_image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )

  const joins = db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )

  const moves = db.prepare(
    `UPDATE playlist_tracks SET position = ?
      WHERE playlist_id = ? AND track_id = ? AND removed_at IS NULL`,
  )

  const leaves = db.prepare(
    `UPDATE playlist_tracks SET removed_at = ?
      WHERE playlist_id = ? AND track_id = ? AND removed_at IS NULL`,
  )

  const statements: D1PreparedStatement[] = []

  for (const [id, normalized] of offered) {
    const wasAt = placed.get(id)

    // Present and where it already was. Nothing is written, which is not only
    // cheaper: rewriting the row would reset `added_at`, and the moment a Track
    // joined is what migration 0002 keeps that column for.
    if (wasAt === normalized.position) continue

    if (wasAt !== undefined) {
      statements.push(moves.bind(normalized.position, playlistId, id))
      continue
    }

    statements.push(
      track.bind(
        id,
        source,
        normalized.sourceTrackId,
        normalized.title,
        // Always an array, so it is stored as one. Joining it would lose
        // where one artist ends and the next begins, and D1 has to be able
        // to rebuild the snapshot exactly.
        JSON.stringify(normalized.artists),
        normalized.album,
        normalized.durationMs,
        normalized.isrc,
        normalized.coverImageUrl,
      ),
      joins.bind(playlistId, id, normalized.position, at),
    )
  }

  for (const row of present) {
    if (offered.has(row.track_id)) continue
    statements.push(leaves.bind(at, playlistId, row.track_id))
  }

  // What these rows will reflect once the batch lands -- or nothing, when they
  // cannot reflect it.
  //
  // A Source may offer the same recording twice in one Playlist, and migration
  // 0003 made a Track present in a Playlist at most once. Both are deliberate
  // and they disagree: the snapshot keeps both entries, the membership can hold
  // only one, and no arrangement of these rows represents that Version. Saying
  // so is what stops a rebuild quietly serving a list one Track shorter than
  // the one the Source offered -- the reader-facing failure `skipped` exists to
  // prevent, arriving by another road.
  const reflects = offered.size === tracks.length ? version : null

  statements.push(
    db
      .prepare('UPDATE playlists SET membership_version = ? WHERE id = ?')
      .bind(reflects, playlistId),
  )

  // Never empty, because the stamp above is always one of them. A Resolution
  // that moved no Track still says which Version these rows now stand for --
  // and one that could not be represented at all still says that.

  // One batch, so a Resolution that fails part way leaves no half-written
  // Playlist behind. Each Track is inserted before the row that refers to it.
  //
  // The ceiling is D1's thousand queries per invocation, which counts each
  // statement in a batch as one. Two per Track was the old flat cost and it is
  // now the worst case rather than the price of every Resolution: a Track that
  // did not move costs nothing, and one that only moved costs one. The read
  // above adds one statement to every Resolution that reaches here. Issue #26
  // holds the arithmetic and what raising the ceiling costs; nothing local
  // catches it, because Miniflare does not enforce the limit.
  await db.batch(statements)
}

/** A Track and its place in a Playlist, as the two tables spell them. */
interface Recorded {
  source_track_id: string
  title: string
  artists: string
  album: string | null
  duration_ms: number | null
  isrc: string | null
  position: number
  cover_image_url: string | null
}

/**
 * The Tracks a Playlist currently holds, in the order a snapshot lists them.
 *
 * This is the read D1 exists for. DESIGN section 02 keeps a canonical store on
 * the grounds that the KV snapshots can be rebuilt from it, and until issue #25
 * that was a promise nothing called in -- which is why `recordTracks` above had
 * to start writing membership current before this could be written at all.
 *
 * Ordered by `position`, which is the Source's own index rather than a rank
 * over what survived: a skipped entry leaves a gap, and the gap is part of what
 * the snapshot says.
 *
 * `artists` comes back out of the JSON it was stored as. Migration 0002 chose
 * that over a joined string for exactly this moment -- a join could not say
 * where one artist ended and the next began, and this is where that would have
 * become unrecoverable.
 */
export const tracksIn = async (
  db: D1Database,
  playlistId: PlaylistId,
): Promise<NormalizedTrack[]> => {
  const { results } = await db
    .prepare(
      `SELECT t.source_track_id, t.title, t.artists, t.album, t.duration_ms,
              t.isrc, t.cover_image_url, m.position
         FROM playlist_tracks m
         JOIN tracks t ON t.id = m.track_id
        WHERE m.playlist_id = ? AND m.removed_at IS NULL
        ORDER BY m.position`,
    )
    .bind(playlistId)
    .all<Recorded>()

  return results.map((row) => ({
    sourceTrackId: row.source_track_id,
    title: row.title,
    artists: JSON.parse(row.artists) as string[],
    album: row.album,
    durationMs: row.duration_ms,
    isrc: row.isrc,
    position: row.position,
    coverImageUrl: row.cover_image_url,
  }))
}
