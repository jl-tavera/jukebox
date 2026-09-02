import type { ErrorCode, PlaylistId, PlaylistTracks } from '@jukebox/schema'
import { folderFor } from './folders'
import { TRACK_COLUMN_NAMES, type TrackRow } from './migrations'
import type { Mirror } from './mirror'

/**
 * What the Mirror is told, kept out of the commands so a command stays about
 * what it says to the user -- the split `worker/src/playlists.ts` makes against
 * the routes, for the same reason.
 *
 * `reading.ts` is the other half, and the line between them is who is asking
 * rather than which verb the SQL uses. A read a write needs in order to be
 * correct stays here -- `trackedPlaylists` is what Sync asks before it writes,
 * `folderNameOf` is read back the moment after. A read somebody wants an answer
 * to is over there.
 */

/**
 * A Playlist's status in the Mirror: `CONTEXT.md`'s three, and `ok`.
 *
 * Not `@jukebox/schema`'s `PlaylistStatus`, which is the API's `pending | ok`.
 * The API answers about a Resolution it is running; the Mirror records what this
 * machine last learned, and two of the things it can learn are states the
 * contract states as error codes rather than as a status. One of them,
 * `unreachable`, the API has no way to say about itself at all.
 *
 * Declared here because this module writes every one of the four, and read back
 * by `reading.ts` -- so a value renamed on the way in breaks the typecheck on
 * the way out.
 */
export type MirrorStatus = 'pending' | 'ok' | 'gone' | 'unreachable'

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
  // Narrowed out of the four rather than written as its own pair, so that a
  // status renamed in one place is renamed in both. The other two are written
  // by `recordPending` and `recordResolved`, which name them inline in SQL.
  status: Extract<MirrorStatus, 'gone' | 'unreachable'>,
): void => {
  mirror.run('UPDATE playlists SET status = ? WHERE id = ?', [status, id])
}

/**
 * A Track that joined or left, named.
 *
 * The name is here rather than looked up afterwards because the read that finds
 * the change is already holding it: a departed Track's title comes off the row
 * about to be marked Removed, and a new one's off the snapshot being applied.
 * Reading them back would be a second query for something already in hand.
 *
 * A departed Track is named with the title the Mirror held -- the name it was
 * last known by here, which is the only one this machine ever saw.
 */
export type NamedTrack = { trackId: string; title: string }

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

/** What one application of a snapshot changed. */
export type Applied = { added: NamedTrack[]; removed: NamedTrack[] }

/** A Playlist this Mirror tracks, and what Sync needs in order to ask about it. */
export type TrackedPlaylist = { id: PlaylistId; title: string | null; lastVersion: number | null }

/**
 * Every Playlist this user tracks, in a fixed order.
 *
 * `ORDER BY id` so that two Syncs of the same Mirror report in the same order.
 * There is nothing better to sort by: a title may be absent, and nothing records
 * when a Playlist was added.
 *
 * `lastVersion` is `null` for a Playlist that has never resolved, which is
 * exactly the case that must be asked unconditionally -- there is no Version to
 * claim to be holding.
 */
export const trackedPlaylists = (mirror: Mirror): TrackedPlaylist[] =>
  mirror
    .query<{ id: PlaylistId; title: string | null; last_version: number | null }, []>(
      'SELECT id, title, last_version FROM playlists ORDER BY id',
    )
    .all()
    .map((row) => ({ id: row.id, title: row.title, lastVersion: row.last_version }))

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
 * before-and-after read already does, and because `sync` is the command that
 * says a change happened out loud.
 */
export const applySnapshot = (
  mirror: Mirror,
  id: PlaylistId,
  snapshot: PlaylistTracks,
  at: number,
): Applied => {
  const source = sourceOf(id)

  return mirror.transaction((): Applied => {
    const before = new Map(
      mirror
        .query<Pick<TrackRow, 'track_id' | 'title'>, [PlaylistId]>(
          'SELECT track_id, title FROM tracks WHERE playlist_id = ? AND removed_at IS NULL ORDER BY position',
        )
        .all(id)
        .map((row) => [row.track_id, row.title] as const),
    )

    // Provisionally gone, all of them. A Track already Removed is left alone, so
    // it keeps the moment it actually left rather than being restamped with this
    // one every time anything syncs.
    mirror.run('UPDATE tracks SET removed_at = ? WHERE playlist_id = ? AND removed_at IS NULL', [
      at,
      id,
    ])

    const upsert = mirror.prepare<void, [TrackRow]>(
      `INSERT INTO tracks (${TRACK_COLUMN_NAMES.join(', ')})
       VALUES (${TRACK_COLUMN_NAMES.map((column) => `$${column}`).join(', ')})
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

    const present = new Map<string, string>()

    for (const track of snapshot.tracks) {
      // ADR-0001's form, derived here because the API sends the Source's own id
      // bare and carries no Source of its own. That ADR covers the client's
      // database explicitly, so storing the bare id would contradict a recorded
      // decision to save a string operation.
      const trackId = `${source}:${track.sourceTrackId}`
      present.set(trackId, track.title)

      // `added_at` is only ever written by the insert half. A Track that left and
      // came back keeps the moment it first joined: its row is that Track's whole
      // history in this Playlist, and the primary key means there is one of them.
      //
      // Named rather than positional, so the eleven values are matched to the
      // columns by SQLite instead of by the order they are written in. Both
      // halves are checked: TypeScript against `TrackRow` because this is a
      // fresh object literal, and `strict: true` at run time, which throws on
      // a parameter the statement asked for and did not get.
      //
      // `removed_at` was the literal NULL in the VALUES and is a bound null
      // now. Same row; the update half below still says it in SQL, because
      // there it is undoing a Removal rather than declaring one.
      upsert.run({
        playlist_id: id,
        track_id: trackId,
        title: track.title,
        artists: JSON.stringify(track.artists),
        album: track.album,
        duration_ms: track.durationMs,
        isrc: track.isrc,
        cover_image_url: track.coverImageUrl,
        position: track.position,
        added_at: at,
        removed_at: null,
      })
    }

    recordResolved(mirror, id, snapshot, at)

    return {
      added: namedTracks(present, (trackId) => !before.has(trackId)),
      removed: namedTracks(before, (trackId) => !present.has(trackId)),
    }
  })()
}

/**
 * One side of the difference between two pictures of a Playlist, in the Source's
 * own order -- the snapshot arrives in it, and the read of what was here is
 * ordered by position to match.
 */
const namedTracks = (tracks: Map<string, string>, joinedOrLeft: (trackId: string) => boolean): NamedTrack[] =>
  [...tracks]
    .filter(([trackId]) => joinedOrLeft(trackId))
    .map(([trackId, title]) => ({ trackId, title }))

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

/**
 * Stops tracking a Playlist here, and takes its Tracks with it.
 *
 * The only delete in the CLI, and it stays the only one. Everywhere else a
 * Playlist that goes wrong keeps what it had -- DESIGN section 09's rule, and
 * the reason `recordRefusal` moves a status and touches nothing else. This is
 * the one place a person has asked.
 *
 * The Tracks go through the cascade rather than through a second statement,
 * which is what `mirror.ts` turns `PRAGMA foreign_keys` on for. Two statements
 * would be the same rows deleted in the same order with one more chance of
 * being interrupted between them.
 *
 * Nothing upstream is told, because there is nothing to tell: the worker has no
 * notion of who tracks what and no endpoint that could be given one. The
 * command says so out loud, since a reader could reasonably assume otherwise.
 */
export const stopTracking = (mirror: Mirror, id: PlaylistId): void => {
  mirror.run('DELETE FROM playlists WHERE id = ?', [id])
}
