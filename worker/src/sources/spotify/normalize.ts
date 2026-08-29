import type { NormalizedPlaylist, NormalizedTrack } from '../registry'
import type { Image, ItemsPage } from './payloads'

/**
 * Source-shaped to domain-shaped. Pure and synchronous, which is what lets the
 * cases that actually vary -- entries that are not Tracks, a missing ISRC,
 * several artists, cover sizes -- be driven straight from the captured
 * responses rather than through the whole pipeline.
 *
 * It takes the pages rather than one page so that reading a longer playlist is
 * a change to how they are fetched and not to what they mean.
 */
export const normalize = (pages: readonly ItemsPage[]): NormalizedPlaylist => {
  const tracks: NormalizedTrack[] = []
  let skipped = 0

  // Indexed over every entry the Source offered rather than over what survives,
  // so `position` stays the Source's own and what was skipped leaves a gap.
  const entries = pages.flatMap((page) => [...page.items])

  entries.forEach((entry, position) => {
    const item = entry.item

    if (
      // An entry Spotify will no longer serve.
      item === null ||
      // A podcast episode. Discriminated on `type` and never on the presence
      // of `album` or `artists`: Spotify drops `additional_types=episode` from
      // its own paging links, and without that parameter an episode arrives
      // typed "episode" but shaped like a track. Judging by shape would put a
      // podcast in the library as a Track, silently. See MANIFEST.md finding 5.
      item.type !== 'track' ||
      // An audio file on the person's own machine. Its type is still "track",
      // so `is_local` and the null id are the only signals -- and Jukebox has
      // nothing to mirror for a file it cannot see.
      entry.is_local ||
      item.id === null
    ) {
      skipped += 1
      return
    }

    tracks.push({
      sourceTrackId: item.id,
      title: item.name,
      // Always an array, including for one artist: joining them would lose
      // where one name ends and the next begins.
      artists: (item.artists ?? []).map((artist) => artist.name),
      album: item.album?.name ?? null,
      durationMs: item.duration_ms,
      isrc: item.external_ids?.isrc ?? null,
      position,
      coverImageUrl: largestCover(item.album?.images),
    })
  })

  return { tracks, skipped }
}

/**
 * The widest image the Source offers, destined for file tags -- downscaling
 * later is possible where upscaling is not.
 *
 * Chosen by width rather than taken from the front of the list. Spotify orders
 * them widest first in every captured response, so the two agree today, but
 * that ordering is a convention rather than a documented guarantee and the
 * criterion is the largest.
 *
 * `null` when the Source offers none. No captured response reaches that for a
 * real catalog track -- only local files have an empty image list, and those
 * are skipped above -- so the guard is written for the shape rather than for a
 * case any fixture exhibits. MANIFEST.md finding 3 records the same thing
 * about ISRC.
 */
const largestCover = (images: readonly Image[] | undefined): string | null => {
  let widest: Image | undefined

  for (const image of images ?? []) {
    if (widest === undefined || image.width > widest.width) widest = image
  }

  return widest?.url ?? null
}
