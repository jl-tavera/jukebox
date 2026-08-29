import type { PlaylistId } from '@jukebox/schema'
import { markGone, markResolved, markUnreachable, readTracked } from './playlists'
import { comparedWithServed, writeSnapshot } from './snapshots'
import { PlaylistGone } from './sources/gone'
import { sourceNamed } from './sources/registry'
import { recordTracks } from './tracks'

/**
 * Resolution: turning a Playlist's address into a normalized list of Tracks.
 * `CONTEXT.md` gives it that name; this module is where it happens.
 *
 * It runs out of band, never in a request. That is the whole reason the queue
 * is here: upstream usage stays proportional to Playlists rather than to the
 * people asking about them.
 */

/**
 * What a Resolution is asked for with. The id is the whole of it: everything
 * else about the Playlist is already in D1, which is canonical, and a message
 * carrying a copy could only disagree with it.
 */
export interface ResolutionMessage {
  id: PlaylistId
}

/**
 * Reads a Playlist from its Source and makes the result servable.
 *
 * The write order is load-bearing, and it runs backwards from what a reader
 * touches first:
 *
 *   1. the Tracks and their membership, into D1;
 *   2. the snapshot, under its own Version's key;
 *   3. head, naming that Version -- the moment the Tracks become servable;
 *   4. the Playlist row, catching up to the Version it now has.
 *
 * Head moving is what makes the answer visible, so everything the answer is
 * made of exists before it moves, and nothing that contradicts it exists
 * before then either. A Playlist marked `ok` ahead of step 3 would be one the
 * Tracks endpoint has no honest answer for.
 *
 * All four steps can happen twice. A message that fails is delivered again, and
 * a queue may also redeliver one that already succeeded, so this runs at most
 * once per Playlist only by accident. What makes that safe is below: nothing is
 * written when nothing changed, and the Version is counted from what is being
 * served rather than from the row, which may be a step behind.
 */
export const resolve = async (env: Env, id: PlaylistId): Promise<void> => {
  const playlist = await readTracked(env.DB, id)

  // Nothing tracks this id. Retrying will not change that, so the Resolution
  // is finished rather than failed.
  if (playlist === undefined) return

  const source = sourceNamed(playlist.source)
  if (source === undefined) {
    throw new Error(`no Source named ${playlist.source} to resolve ${id} with`)
  }

  // Only the Source call is guarded, and deliberately only that. Unreachable is
  // a statement about a Source, and a Playlist given it because D1 blinked or
  // because `normalize` has a bug would tell every reader to try a Source that
  // answered perfectly well -- and would leave a 503 standing over a Playlist
  // that has simply not been read yet. Anything failing outside these two lines
  // throws with the status untouched, which leaves the Playlist as it was and
  // the message on its way round again.
  let raw: unknown
  try {
    raw = await source.fetch(playlist.sourceId, env)
  } catch (failure) {
    if (failure instanceof PlaylistGone) {
      // This Resolution is finished rather than failed. No number of further
      // attempts will change what the Source said, so the message is
      // acknowledged rather than thrown back at the queue to be delivered again
      // until it runs out of tries.
      await markGone(env.DB, id)
      return
    }

    // Believed temporary: recorded as such, then thrown on. The throw is how
    // the worker asks for the message again -- a delivery that does not
    // complete is one the queue redelivers, as many times as wrangler.jsonc
    // allows and then into the dead-letter queue it names.
    await markUnreachable(env.DB, id)
    throw failure
  }

  const contents = source.normalize(raw)

  // One instant for everything this Resolution writes.
  const at = Math.floor(Date.now() / 1000)
  const served = await comparedWithServed(env.CACHE, id, contents)

  if (served?.unchanged) {
    // A Version names contents, so finding the contents already named moves
    // nothing: no snapshot, no membership rows, and no Version for a client to
    // be handed a whole snapshot under for no reason.
    //
    // The row is still moved, and to the Version being *served*. This
    // Resolution happened and it succeeded, and a row that did not say so would
    // leave a Playlist whose Tracks are being served answering every later add
    // with "poll for them" -- and would look, to the refresh that eventually
    // schedules these, like one nobody had ever looked at.
    //
    // Nothing needs recording in D1 either: head exists only if `recordTracks`
    // completed on some earlier attempt, because it is first in the order above.
    await markResolved(env.DB, id, served.version, at)
    return
  }

  await recordTracks(env.DB, id, playlist.source, contents.tracks, at)

  // Past both records of where this Playlist has got to. Head is what has been
  // *served*; the row is what has been *acknowledged*, and it lags whenever an
  // attempt died between the two. Counting from the row alone would write a
  // second, different document over the key an already-served Version names --
  // and a client holding that Version would keep being told it is current. A
  // Version names one immutable snapshot, and this is what keeps that true.
  //
  // A Playlist with neither is on its first Resolution, and gets Version 1:
  // Pending had none.
  const version = Math.max(served?.version ?? 0, playlist.version) + 1

  await writeSnapshot(env.CACHE, id, version, contents)
  await markResolved(env.DB, id, version, at)
}
