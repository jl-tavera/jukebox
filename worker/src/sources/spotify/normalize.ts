import type { NormalizedPlaylist, NormalizedTrack } from '../registry'
import type { Image, PlaylistRead } from './payloads'

/**
 * Source-shaped to domain-shaped. Pure and synchronous, which is what lets the
 * cases that actually vary -- entries that are not Tracks, a missing ISRC,
 * several artists, cover sizes -- be driven straight from the captured
 * responses rather than through the whole pipeline.
 *
 * It takes the pages rather than one page so that reading a longer playlist is
 * a change to how they are fetched and not to what they mean.
 *
 * It takes what the playlist says about itself alongside them, because the title
 * is the one thing normalized here that no entry has a say in.
 */
export const normalize = ({ metadata, pages }: PlaylistRead): NormalizedPlaylist => {
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

  return { title: playlistTitle(metadata.name), tracks, skipped }
}

/**
 * The Source's name for the Playlist, or `null` where what it offered does not
 * amount to one.
 *
 * Absent, empty and whitespace-only are one answer because they are one fact:
 * the Source has no name to give. Trimming first is what makes them one case
 * rather than three -- and what stops the same name typed with a trailing space
 * being a different title from the name without it, which matters because
 * ADR-0004 has the client cut a Library folder name out of this.
 *
 * `||` rather than `??`, deliberately: the empty string is one of the values
 * that becomes `null`, not a name that happens to be short.
 *
 * Never a placeholder. "Untitled playlist", the Source's id, the address --
 * each would arrive downstream indistinguishable from a name somebody chose,
 * and nothing past this point could tell the invention from the fact. An absent
 * title is something a client can decide what to show for; a convincing one is
 * not.
 */
const playlistTitle = (name: string | null | undefined): string | null => name?.trim() || null

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
