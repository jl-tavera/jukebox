import type { PlaylistId } from '@jukebox/schema'
import { readResolved, readStatusAndVersion } from './playlists'
import { document, readHead, readSnapshot } from './snapshots'
import { tracksIn } from './tracks'

/**
 * What a reader asking for a Playlist's Tracks is answered with, and where the
 * answer is found.
 *
 * The sequence lives here rather than in the route because it has three steps
 * and two of them are fallbacks, and `index.ts` had reassembled it twice. What
 * that cost was visible: the route had to turn a `null` snapshot into a throw,
 * because a caller holding the pieces separately has nowhere else to put a step
 * that failed. Nothing here hands a caller a `null` it has to invent an answer
 * for.
 *
 * Two questions rather than one, and the split is deliberate. The conditional
 * check sits between them: DESIGN section 05 makes a `304` cost one cache read
 * and no D1 query at all, and a single call that fetched a body on the way to
 * answering "which Version?" would spend the whole of what that path saves.
 */

/** Which Version a reader should be served, or why there is none. */
export type Serving =
  | { kind: 'untracked' }
  | { kind: 'pending' }
  | { kind: 'refused'; status: 'gone' | 'unreachable' }
  | { kind: 'serving'; version: string }

export const servedVersion = async (env: Env, id: PlaylistId): Promise<Serving> => {
  // Head first, and alone: everything a conditional request costs is this one
  // read and the comparison the route makes on it. Moving the row read below
  // above this line would answer the same in every case and cost the common one
  // everything DESIGN section 05 built it to save.
  const head = await readHead(env.CACHE, id)
  if (head !== null) return { kind: 'serving', version: head }

  const stored = await readStatusAndVersion(env.DB, id)

  // Ids are derived from the URL, so an id nothing tracks is a Playlist that
  // was never added rather than one whose Resolution failed -- which is why
  // this is not the Gone answer.
  if (stored === undefined) return { kind: 'untracked' }

  // A Version the row names is servable, whatever the status has since become.
  // Asked before the status rather than after it, and that order is the whole
  // of the rule.
  //
  // The row is trustworthy about this: it is moved to a Version only after the
  // snapshot under that Version is written and head names it, so a row naming
  // Version n is a promise that n was servable. Nothing that happens to the
  // Playlist afterwards unwrites it -- neither `markGone` nor `markUnreachable`
  // touches `version`, because nothing was read when either ran.
  //
  // So a queue redelivering a Resolution that already succeeded, meeting a 404
  // the second time, cannot cost a reader the Tracks that are still stored.
  // Read through head that was already true, since head is read first; this is
  // what makes the cold path agree with it. DESIGN section 09: a remote failure
  // never costs a reader what they already had.
  if (stored.version > 0) return { kind: 'serving', version: String(stored.version) }

  // No Version, so there is nothing to serve and the status is the answer.
  // `version` is 0 until a Resolution writes one, which is what `recordPending`
  // inserts.
  if (stored.status === 'gone') return { kind: 'refused', status: 'gone' }
  if (stored.status === 'unreachable') return { kind: 'refused', status: 'unreachable' }

  return { kind: 'pending' }
}

/**
 * The document a Version is served as: the stored one, or one rebuilt from D1
 * when the cache no longer holds it.
 *
 * `missing` is a stated miss rather than a `null` -- the caller has an answer
 * for it, and it is the only thing left that a request for a Playlist's Tracks
 * cannot be given a body for.
 */
export type Body = { kind: 'served'; text: string } | { kind: 'missing' }

export const servedBody = async (env: Env, id: PlaylistId, version: string): Promise<Body> => {
  const stored = await readSnapshot(env.CACHE, id, version)

  // The ordinary answer, and the stored document is the response body: served
  // as the bytes it was written as, with no parse on the way through.
  if (stored !== null) return { kind: 'served', text: stored }

  return rebuilt(env, id, version)
}

/**
 * The snapshot for `version`, put back together out of D1.
 *
 * DESIGN section 09's degradation for a cache that has lost a key, and DESIGN
 * section 02's reason for keeping a canonical store at all. It answers the
 * bytes the cache would have served or it answers nothing: a client caches what
 * it is handed under the Version it is handed it with, so a document that is
 * only nearly right is a second meaning for a Version that names one snapshot.
 *
 * A snapshot is made of four things and D1 keeps them in three places, so the
 * checks below are one per way they can disagree. Each is a refusal rather than
 * an approximation, because there is no such thing as a nearly-right answer
 * here -- only a wrong one a client would cache and never re-ask for.
 */
const rebuilt = async (env: Env, id: PlaylistId, version: string): Promise<Body> => {
  const resolved = await readResolved(env.DB, id)
  if (resolved === undefined) return { kind: 'missing' }

  // Compared as the number D1 holds rather than as the text KV does, so the two
  // columns below are read the way they are stored and the conversion happens
  // once. A head that does not name a Version at all becomes `NaN`, which
  // matches neither -- the same refusal, reached without a special case.
  const wanted = Number(version)

  // The row describes a different Version from the one being asked for. That
  // happens when an attempt died after head moved and before the row caught up,
  // and it means the title and the count here belong to the Resolution before
  // this one.
  if (resolved.version !== wanted) return { kind: 'missing' }

  // The membership describes a different Version again -- the opposite skew, and
  // the one the row alone cannot see. `recordTracks` runs *first*, so an attempt
  // that died before writing its snapshot leaves the rows a Version ahead of
  // everything naming them. The row still says the Version it is serving, so the
  // check above passes; these Tracks are the next Version's.
  //
  // `null` is the same refusal reached another way: rows that reflect no Version
  // anybody can name, which is a Playlist resolved before migration 0004 or one
  // whose Source offered the same recording twice.
  if (resolved.membershipVersion !== wanted) return { kind: 'missing' }

  // Resolved before migration 0004, so nothing counted what the Source offered
  // that never became a Track. It is the one field D1 could not otherwise
  // reconstruct, and inventing a zero would make a list shorter than the
  // Source's read as data loss -- which is the reason the field exists.
  if (resolved.skipped === null) return { kind: 'missing' }

  const tracks = await tracksIn(env.DB, id)

  // Through the same builder the write went through, so the bytes agree by
  // construction rather than by two places being kept in step.
  return {
    kind: 'served',
    text: JSON.stringify(
      document(resolved.version, {
        title: resolved.title,
        skipped: resolved.skipped,
        tracks,
      }),
    ),
  }
}
