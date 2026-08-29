import type { PlaylistId, PlaylistTracks } from '@jukebox/schema'
import { markResolved, readTracked } from './playlists'
import { writeSnapshot } from './snapshots'
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

  const { tracks, skipped } = source.normalize(await source.fetch(playlist.sourceId, env))

  // One instant for everything this Resolution writes.
  const at = Math.floor(Date.now() / 1000)
  await recordTracks(env.DB, id, playlist.source, tracks, at)

  // A Version names a snapshot, so the first Resolution of a Playlist makes
  // Version 1 -- Pending had none.
  const snapshot: PlaylistTracks = { version: playlist.version + 1, skipped, tracks }
  await writeSnapshot(env.CACHE, id, snapshot)

  await markResolved(env.DB, id, snapshot.version, at)
}
