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

/** Everything a snapshot holds except the Version naming it. */
export type SnapshotContents = Omit<PlaylistTracks, 'version'>

/**
 * The document a Version is stored and served as.
 *
 * Built here and nowhere else, because `comparedWithServed` compares one of these
 * against stored bytes and the comparison is over the serialized text. Two call
 * sites listing the same fields in a different order would compare unequal
 * while meaning the same thing, and the symptom would be a Version moving on
 * every Resolution for no reason anybody could see.
 *
 * The title is in here, so a Playlist renamed on its Source moves its Version
 * even when its membership did not. That is right rather than incidental: the
 * Version is the whole of a client's "am I current?", and a client holding a
 * name the Source has since changed is not current.
 */
const document = (version: number, contents: SnapshotContents): PlaylistTracks => ({
  version,
  title: contents.title,
  skipped: contents.skipped,
  tracks: contents.tracks,
})

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
  version: number,
  contents: SnapshotContents,
): Promise<void> => {
  // The Version is written as text once, and both keys are built from that
  // same text, so head can never name a key spelled differently.
  const named = String(version)

  await cache.put(snapshotKey(id, named), JSON.stringify(document(version, contents)))
  await cache.put(headKey(id), named)
}

/**
 * The Version a reader is being served right now, and whether `contents` is
 * what that Version means. `null` when nothing is being served.
 *
 * This is `CONTEXT.md`'s definition of a Version made executable -- it moves
 * "whenever that playlist's contents change" -- so the question is asked here,
 * where the stored document's shape is already known, rather than by the caller.
 * A Resolution that had to ask it itself would have to learn what a snapshot is
 * made of, on top of the key names this module already exists to keep.
 */
export const comparedWithServed = async (
  cache: KVNamespace,
  id: PlaylistId,
  contents: SnapshotContents,
): Promise<{ version: number; unchanged: boolean } | null> => {
  const head = await readHead(cache, id)
  if (head === null) return null

  const version = Number(head)

  // Head is only ever written from a Version, so this cannot happen. It is
  // checked because the failure would be quiet in a way its neighbours are not:
  // a NaN would go on to name the next Version, and every later comparison
  // against it would be false.
  if (!Number.isInteger(version)) {
    throw new Error(`head of ${id} does not name a Version: ${head}`)
  }

  // Head names a snapshot that is not there. Answering "nothing has changed"
  // would leave the hole; answering as though nothing were served writes a
  // fresh Version over it, which is the only one of the two that heals.
  const stored = await readSnapshot(cache, id, head)
  if (stored === null) return { version, unchanged: false }

  // Compared as text rather than parsed and walked. `readSnapshot` answers text
  // because parsing on the hot path would cost it for nothing; the same choice
  // turns out to be what the cold path wants, since the stored bytes were
  // written from `document` above and are byte-identical to a candidate at the
  // same Version exactly when nothing has changed.
  //
  // The one cost, said rather than discovered: changing how a Track is
  // serialized would read as every Playlist having changed and move every
  // Version once. That is the safe direction -- over-reporting a change rather
  // than missing one -- and it lands on a deploy already changing the shape.
  return { version, unchanged: JSON.stringify(document(version, contents)) === stored }
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
