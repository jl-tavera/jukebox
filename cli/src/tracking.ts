import type { ErrorCode, PlaylistId, PlaylistTracks } from '@jukebox/schema'
import { folderFor } from './folders'
import type { Mirror } from './mirror'

/**
 * What the Mirror is told, kept out of the commands so a command stays about
 * what it says to the user -- the split `worker/src/playlists.ts` makes against
 * the routes, for the same reason.
 */

/**
 * The Source a namespaced id belongs to.
 *
 * The first colon, because ADR-0001 joins a Source name to the Source's own id
 * with one and says nothing about what the second half may contain -- and the
 * stub Source's addresses contain another colon, so "the last one" would answer
 * differently for it. The ADR does not write this rule down; this is where the
 * client chooses it, and the Source name is the half that cannot hold a colon.
 *
 * An id with no colon at all cannot come from the API, whose ids are built in one
 * function. Treated as a Source with no id rather than guarded against, because a
 * derived Track id of `spotify:blue-dot` and one of `spotify::blue-dot` are both
 * wrong in the same harmless way and neither is worth a branch.
 */
const sourceOf = (id: PlaylistId): string => {
  const colon = id.indexOf(':')
  return colon === -1 ? id : id.slice(0, colon)
}

/**
 * Records a Playlist as Pending, or leaves the one already there exactly as it
 * is.
 *
 * `ON CONFLICT DO NOTHING`, untargeted for the reason the worker's own
 * `recordPending` gives: it covers the primary key without also swallowing a
 * `NOT NULL` violation the way `INSERT OR IGNORE` would. This is the whole of
 * "adding a Playlist already tracked is harmless and creates no duplicate" --
 * there is no prior lookup and no chance of resetting a Playlist that has
 * already resolved back to Pending.
 */
export const recordPending = (
  mirror: Mirror,
  playlist: { id: PlaylistId; url: string },
): void => {
  mirror.run(
    `INSERT INTO playlists (id, url, status) VALUES (?, ?, 'pending')
     ON CONFLICT DO NOTHING`,
    [playlist.id, playlist.url],
  )
}

/**
 * Records that the Source will not serve this Playlist, or could not be read.
 *
 * Neither state has Tracks, so nothing else moves: no Version, no
 * `last_synced_at`, and whatever Tracks the Playlist already had it keeps. A
 * remote failure never costs a reader what they already had, which is DESIGN
 * section 09's rule and the reason `remove` is the only thing that deletes.
 */
const markLocalStatus = (
  mirror: Mirror,
  id: PlaylistId,
  status: 'gone' | 'unreachable',
): void => {
  mirror.run('UPDATE playlists SET status = ? WHERE id = ?', [status, id])
}

/**
 * Records what a refusal means for a Playlist already tracked.
 *
 * Here rather than in each command because it is a fact about the Mirror rather
 * than about who asked. Two of the contract's four codes have a local status and
 * two deliberately have none: `playlist_not_found` is the server saying it holds
 * no row, which is not a claim about the Playlist itself, and `invalid_url`
 * never reaches a Playlist that was recorded.
 */
export const recordRefusal = (mirror: Mirror, id: PlaylistId, code: ErrorCode): void => {
  if (code === 'playlist_gone') markLocalStatus(mirror, id, 'gone')
  if (code === 'source_unavailable') markLocalStatus(mirror, id, 'unreachable')
}

/** What one application of a snapshot changed, in namespaced Track ids. */
export type Applied = { added: string[]; removed: string[] }

/**
 * Brings a Playlist's Tracks into agreement with one snapshot, and answers what
 * moved.
 *
 * Idempotent, which is the property that makes an interrupted Sync safe to rerun:
 * applying the same snapshot twice reaches the same rows and leaves them saying
 * the same thing.
 *
 * The order inside is the interesting part. Every present Track is marked Removed
 * first and then un-marked by the upsert that finds it still listed, so what is
 * left holding a `removed_at` is exactly what the Source stopped listing. Doing
 * it the other way round -- naming the departed in a `NOT IN (...)` -- would put
 * one bound parameter per Track between the CLI and SQLite's limit, and a
 * ten-thousand-Track Playlist is a real thing to paste in.
 *
 * `add` throws the answer away. It is here because computing it is what the
 * before-and-after read already does, and #36 is the command that says a change
 * happened out loud.
 */
export const applySnapshot = (
  mirror: Mirror,
  id: PlaylistId,
  snapshot: PlaylistTracks,
  at: number,
): Applied => {
  const source = sourceOf(id)

  return mirror.transaction((): Applied => {
    const before = new Set(
      mirror
        .query<{ track_id: string }, [PlaylistId]>(
          'SELECT track_id FROM tracks WHERE playlist_id = ? AND removed_at IS NULL',
        )
        .all(id)
        .map((row) => row.track_id),
    )

    // Provisionally gone, all of them. A Track already Removed is left alone, so
    // it keeps the moment it actually left rather than being restamped with this
    // one every time anything syncs.
    mirror.run('UPDATE tracks SET removed_at = ? WHERE playlist_id = ? AND removed_at IS NULL', [
      at,
      id,
    ])

    const upsert = mirror.prepare(
      `INSERT INTO tracks (
         playlist_id, track_id, title, artists, album, duration_ms, isrc,
         cover_image_url, position, added_at, removed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT (playlist_id, track_id) DO UPDATE SET
         title = excluded.title,
         artists = excluded.artists,
         album = excluded.album,
         duration_ms = excluded.duration_ms,
         isrc = excluded.isrc,
         cover_image_url = excluded.cover_image_url,
         position = excluded.position,
         removed_at = NULL`,
    )

    const present = new Set<string>()

    for (const track of snapshot.tracks) {
      // ADR-0001's form, derived here because the API sends the Source's own id
      // bare and carries no Source of its own. That ADR covers the client's
      // database explicitly, so storing the bare id would contradict a recorded
      // decision to save a string operation.
      const trackId = `${source}:${track.sourceTrackId}`
      present.add(trackId)

      // `added_at` is only ever written by the insert half. A Track that left and
      // came back keeps the moment it first joined: its row is that Track's whole
      // history in this Playlist, and the primary key means there is one of them.
      upsert.run(
        id,
        trackId,
        track.title,
        JSON.stringify(track.artists),
        track.album,
        track.durationMs,
        track.isrc,
        track.coverImageUrl,
        track.position,
        at,
      )
    }

    recordResolved(mirror, id, snapshot, at)

    return {
      added: [...present].filter((trackId) => !before.has(trackId)),
      removed: [...before].filter((trackId) => !present.has(trackId)),
    }
  })()
}

/**
 * Moves the Playlist row to the Version this snapshot names, and gives it a
 * folder name if it does not have one yet.
 *
 * `COALESCE` is ADR-0004 written as SQL: the folder keeps the name it was created
 * with, because renaming a directory of the user's files in response to a remote
 * change is exactly what the rule against destroying local files exists to
 * prevent. So a Playlist renamed on its Source moves its Version, its title and
 * nothing else.
 *
 * Which also means the name is computed at the first moment there is a title to
 * compute it from. That is this call during `add` whenever Resolution lands
 * inside the wait, and the first Sync otherwise -- rather than a name derived
 * from an id at add time and then kept for ever because ADR-0004 forbids
 * changing it.
 */
const recordResolved = (
  mirror: Mirror,
  id: PlaylistId,
  snapshot: PlaylistTracks,
  at: number,
): void => {
  mirror.run(
    `UPDATE playlists
        SET title = ?, status = 'ok', last_version = ?, skipped = ?, last_synced_at = ?,
            folder_name = COALESCE(folder_name, ?)
      WHERE id = ?`,
    [snapshot.title, snapshot.version, snapshot.skipped, at, folderName(mirror, id, snapshot), id],
  )
}

/**
 * The folder name this Playlist would take, or `null` when it already has one
 * and nothing needs computing.
 *
 * The names already spoken for are read excluding this Playlist's own, so a
 * Playlist that somehow reaches here twice is not told its own name is taken and
 * handed a suffix for colliding with itself.
 */
const folderName = (mirror: Mirror, id: PlaylistId, snapshot: PlaylistTracks): string | null => {
  if (folderNameOf(mirror, id) !== null) return null

  const taken = new Set(
    mirror
      .query<{ folder_name: string }, [PlaylistId]>(
        'SELECT folder_name FROM playlists WHERE folder_name IS NOT NULL AND id != ?',
      )
      .all(id)
      .map((other) => other.folder_name),
  )

  return folderFor(snapshot.title, id, (candidate) => taken.has(candidate))
}

/**
 * The folder this Playlist's files will be put in, or `null` while it has no
 * title to name one after.
 *
 * Read back rather than returned from `applySnapshot`, because it is not
 * something that application changed -- it is what the Playlist has, whether this
 * run computed it or a run last week did.
 */
export const folderNameOf = (mirror: Mirror, id: PlaylistId): string | null =>
  mirror
    .query<{ folder_name: string | null }, [PlaylistId]>(
      'SELECT folder_name FROM playlists WHERE id = ?',
    )
    .get(id)?.folder_name ?? null
