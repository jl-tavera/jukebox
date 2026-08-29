import type { PlaylistId, PlaylistTracks } from '@jukebox/schema'

/**
 * The KV snapshot store -- the hot read path. Most reads are served from here
 * and touch nothing else, which is what keeps the cost line flat as callers
 * grow. It is the only module that knows these key names.
 */

/** The one mutable key. It names the Version a reader should be served. */
const headKey = (id: PlaylistId) => `playlist:${id}:head`

/** Immutable, and written once per Version. Nothing ever invalidates one. */
const snapshotKey = (id: PlaylistId, version: string) => `playlist:${id}:v${version}`

/**
 * Writes a Version's snapshot and then names it.
 *
 * The order is the guarantee, which is why one function owns both writes
 * rather than leaving a call site to get it right. A reader catching the old
 * head reads a snapshot that is still there and still internally consistent;
 * writing head first would open a window in which one Version's Tracks are
 * served labelled as another's, and a client would cache a wrong answer under
 * a Version it believes it holds.
 */
export const writeSnapshot = async (
  cache: KVNamespace,
  id: PlaylistId,
  snapshot: PlaylistTracks,
): Promise<void> => {
  // The Version is written as text once, and both keys are built from that
  // same text, so head can never name a key spelled differently.
  const version = String(snapshot.version)

  await cache.put(snapshotKey(id, version), JSON.stringify(snapshot))
  await cache.put(headKey(id), version)
}

/** The Version a reader should be served, or `null` for a Playlist with none. */
export const readHead = (cache: KVNamespace, id: PlaylistId): Promise<string | null> =>
  cache.get(headKey(id))

/**
 * A snapshot as it was stored. Text rather than an object, because the stored
 * document is the response body: parsing it only to serialize it again would
 * cost the hot path for nothing.
 */
export const readSnapshot = (
  cache: KVNamespace,
  id: PlaylistId,
  version: string,
): Promise<string | null> => cache.get(snapshotKey(id, version))
