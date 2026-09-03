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
 * A Track as its Source describes it, as one element of the document `tracks`
 * rows are inserted from. CONTEXT.md's Track, minus the position -- which is
 * the other table's business, and `Placed` below.
 */
interface Described {
  id: string
  sourceTrackId: string
  title: string
  artists: string
  album: string | null
  durationMs: number | null
  isrc: string | null
  coverImageUrl: string | null
}

/** A Track and where it sits, as one element of a membership document. */
interface Placed {
  id: string
  position: number
}

/**
 * The most JSON one bound parameter carries, in UTF-16 code units.
 *
 * D1 caps a single string at 2 MB, and a Playlist at Spotify's own ceiling of
 * 10,000 entries serializes to more than that, so the longest Playlist a Source
 * will really offer has to arrive in more than one piece.
 *
 * Counted in code units rather than bytes because the bound is then provable
 * without measuring any of them: UTF-8 spends at most three bytes on a code
 * unit, so 600,000 of them is 1.8 MB whatever alphabet the titles are written
 * in. Measuring instead would buy a slightly bigger piece for a pass over every
 * Track, and the piece is already an order of magnitude larger than it needs to
 * be.
 *
 * Pieces of one document, never of one batch. Cutting the document does not cut
 * the transaction -- see the comment above `db.batch` below.
 */
const PIECE = 600_000

/**
 * `rows` as JSON documents, each small enough to be bound as one parameter.
 *
 * Cut by size rather than by a count of rows, because a Playlist of long titles
 * is not a Playlist of short ones and a count chosen for either would be wrong
 * about the other. A row larger than a whole piece would still be emitted, on
 * its own: there is nothing better to do with it, and no Track approaches it.
 */
const documents = <T>(rows: readonly T[]): string[] => {
  const cut: string[] = []
  let piece: string[] = []
  // The two brackets a document always carries.
  let units = 2

  for (const row of rows) {
    const text = JSON.stringify(row)

    if (piece.length > 0 && units + text.length + 1 > PIECE) {
      cut.push(`[${piece.join(',')}]`)
      piece = []
      units = 2
    }

    piece.push(text)
    // The row, and the comma before it.
    units += text.length + 1
  }

  if (piece.length > 0) cut.push(`[${piece.join(',')}]`)

  return cut
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
 * Each of the three writes takes the Tracks it concerns as a JSON document
 * bound as one parameter, which `json_each` opens back into rows. So a
 * Resolution costs D1 the same handful of statements whether the Playlist holds
 * five Tracks or five thousand -- see the comment above `db.batch` below, and
 * ADR-0009 for what that replaced and why.
 *
 * Three and not four because joining and moving became one statement, which is
 * not only a saving: driven from the document, an upsert seeks the row it means
 * through `playlist_tracks_present`, where the join it replaced read the whole
 * of the Playlist once per Track offered. The saving is what fits the budget;
 * this is what fits the thirty seconds a D1 query gets.
 *
 * `WHERE true` on both inserts is not a filter and drops nothing. SQLite cannot
 * tell an upsert's `ON` from a join's when the values come from a `SELECT`, and
 * a `WHERE` clause is what resolves the ambiguity; `true` is the one that
 * changes no row.
 *
 * `ON CONFLICT DO NOTHING` on `tracks` because a Track is shared: two Playlists
 * can hold the same recording, and the second Resolution to reach it should
 * leave the row alone rather than fail or rewrite it. Naming no conflict target
 * is what keeps it forgiving every constraint rather than one. What
 * `playlist_tracks` does with its two clauses is written where they are.
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

  const records = db.prepare(
    `INSERT INTO tracks
       (id, source, source_track_id, title, artists, album, duration_ms, isrc, cover_image_url)
     SELECT value ->> 'id', ?, value ->> 'sourceTrackId', value ->> 'title',
            value ->> 'artists', value ->> 'album', value ->> 'durationMs',
            value ->> 'isrc', value ->> 'coverImageUrl'
       FROM json_each(?)
      WHERE true
     ON CONFLICT DO NOTHING`,
  )

  // Joining and moving are one statement, because they are one question: where
  // does this Track sit now. A Track with no membership row is inserted; one
  // that has moved conflicts on `playlist_tracks_present` and is re-placed. The
  // update names only `position`, so `added_at` survives it -- the moment a
  // Track joined is what migration 0002 keeps that column for, and re-placing a
  // Track is not it joining again.
  //
  // Two upsert clauses rather than one, and the order is the whole of it. A
  // conflict on the partial index re-places; anything else -- the primary key,
  // which carries `added_at` and so can be met by a row that has since been
  // Removed -- falls through to the second clause and is forgiven, exactly as
  // the single target-less `DO NOTHING` here forgave it before.
  const places = db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
     SELECT ?, value ->> 'id', value ->> 'position', ?
       FROM json_each(?)
      WHERE true
     ON CONFLICT (playlist_id, track_id) WHERE removed_at IS NULL
       DO UPDATE SET position = excluded.position
     ON CONFLICT DO NOTHING`,
  )

  // Named by the Tracks that left rather than by the ones that stayed. A long
  // document is cut into pieces, and `NOT IN` one piece of what the Source
  // still offers would mark most of the Playlist Removed.
  const leaves = db.prepare(
    `UPDATE playlist_tracks SET removed_at = ?
      WHERE playlist_id = ?
        AND removed_at IS NULL
        AND track_id IN (SELECT value FROM json_each(?))`,
  )

  const added: Described[] = []
  const membership: Placed[] = []

  for (const [id, normalized] of offered) {
    const wasAt = placed.get(id)

    // Present and where it already was. Nothing is written, which is not only
    // cheaper: it keeps the document holding what changed rather than what was
    // offered, so an unchanged Playlist costs a Resolution nothing to record.
    if (wasAt === normalized.position) continue

    membership.push({ id, position: normalized.position })

    // Already recorded, and only its place has moved. The statement above
    // covers that on its own; what is skipped here is the `tracks` row, which
    // exists and holds the same Track it did before.
    if (wasAt !== undefined) continue

    added.push({
      id,
      sourceTrackId: normalized.sourceTrackId,
      title: normalized.title,
      // Always an array, so it is stored as one. Joining it would lose where
      // one artist ends and the next begins, and D1 has to be able to rebuild
      // the snapshot exactly. Stringified here rather than left to SQL, so the
      // column goes on holding the bytes it has always held.
      artists: JSON.stringify(normalized.artists),
      album: normalized.album,
      durationMs: normalized.durationMs,
      isrc: normalized.isrc,
      coverImageUrl: normalized.coverImageUrl,
    })
  }

  const left = present.filter((row) => !offered.has(row.track_id)).map((row) => row.track_id)

  const statements: D1PreparedStatement[] = []

  // Every Track recorded before the membership row that refers to it, which is
  // what these being three passes rather than one is for.
  for (const document of documents(added)) {
    statements.push(records.bind(source, document))
  }

  for (const document of documents(membership)) {
    statements.push(places.bind(playlistId, at, document))
  }

  for (const document of documents(left)) {
    statements.push(leaves.bind(at, playlistId, document))
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
  // Playlist behind. Still one, and still for that reason: a document cut into
  // pieces becomes more statements, and every one of them is in this list. A
  // batch is a transaction, so the pieces land together or not at all.
  //
  // Issue #26 expected that guarantee to be the price of raising the ceiling.
  // It was not. What changed is the cost and not the promise: each write takes
  // its Tracks as one bound document rather than one statement each, so this
  // list is a handful of statements whether the Playlist holds five Tracks or
  // five thousand. Before it, a first Resolution cost two statements per Track
  // and ran out of D1's thousand queries per invocation at 499 of them --
  // against a Source that serves 10,000. ADR-0009 records what that replaced.
  //
  // The ceiling that remains is no longer this one, and ADR-0009 does that
  // arithmetic rather than this comment keeping a second copy of it: a piece
  // holds enough Tracks that the thousand queries outlast any Playlist a Source
  // will offer, by two orders of magnitude. What a longer one would meet first
  // is not the budget at all but the total size of a batch's parameters, which
  // Cloudflare documents nowhere and nothing here can measure.
  //
  // `holdingD1sBudget` in the test bindings is what holds this, because
  // Miniflare enforces neither the count nor the ceiling.
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
