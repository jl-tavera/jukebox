import type { PlaylistId } from '@jukebox/schema'
import type { NormalizedTrack, SourceName } from './sources/registry'
import { trackId } from './sources/registry'

/**
 * D1 access for `tracks` and `playlist_tracks`. D1 is the canonical store and
 * is read on the cold path only -- it exists so the KV snapshots can be
 * rebuilt, which is why what is written here has to be lossless.
 */

/**
 * Records a Resolution's Tracks and their membership of the Playlist.
 *
 * `ON CONFLICT DO NOTHING` on `tracks` because a Track is shared: two Playlists
 * can hold the same recording, and the second Resolution to reach it should
 * leave the row alone rather than fail or rewrite it.
 *
 * `at` is passed in rather than read here so that everything one Resolution
 * writes carries the same instant. Unix seconds, matching `refresh_interval_s`.
 */
export const recordTracks = async (
  db: D1Database,
  playlistId: PlaylistId,
  source: SourceName,
  tracks: NormalizedTrack[],
  at: number,
): Promise<void> => {
  if (tracks.length === 0) return

  const track = db.prepare(
    `INSERT INTO tracks
       (id, source, source_track_id, title, artists, album, duration_ms, isrc, cover_image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )

  const membership = db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )

  // One batch, so a Resolution that fails part way leaves no half-written
  // Playlist behind. Each Track is inserted before the row that refers to it.
  await db.batch(
    tracks.flatMap((normalized) => {
      const id = trackId(source, normalized.sourceTrackId)

      return [
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
        membership.bind(playlistId, id, normalized.position, at),
      ]
    }),
  )
}
