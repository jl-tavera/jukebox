/**
 * What Spotify's playlist items endpoint returns, as far as this adapter reads
 * it. Only the fields Resolution uses are declared -- the payload carries many
 * more, and `__fixtures__/MANIFEST.md` records which of them the captures keep
 * and why.
 *
 * These types describe the Source, so they live inside the adapter directory
 * along with everything else written in Spotify's vocabulary.
 */

/** One size of a cover image. Spotify offers several per album. */
export interface Image {
  readonly url: string
  readonly width: number
}

export interface Artist {
  readonly name: string
}

export interface Album {
  readonly name: string
  /** Empty for a local file, which has no album art to offer. */
  readonly images: readonly Image[]
}

/**
 * The media on a playlist entry: a track, or a podcast episode.
 *
 * `type` is a plain string rather than a discriminated union on purpose. It
 * arrives off a network, and finding 5 in MANIFEST.md is precisely that its
 * value cannot be inferred from the fields present -- an episode requested
 * without `additional_types=episode` arrives wearing a track's clothes, gaining
 * `album`, `artists` and `external_ids`. A union of literal types here would
 * let the compiler pretend a decision has been made that only `normalize` can
 * actually make.
 */
export interface Item {
  /** `"track"` or `"episode"`. Read it; do not infer it from the shape. */
  readonly type: string
  /** `null` for a local file -- one of the two signals that it is one. */
  readonly id: string | null
  readonly name: string
  readonly duration_ms: number
  /** Optional because an episode carries none of these three. */
  readonly artists?: readonly Artist[]
  readonly album?: Album | null
  readonly external_ids?: { readonly isrc?: string }
}

/**
 * One line of a playlist. The media is read from `item` rather than `track`:
 * every entry currently arrives carrying both keys and the same object under
 * each, and `item` is the one Spotify's deprecation moves towards.
 */
export interface PlaylistEntry {
  /** `true` for an audio file on the person's own machine, not on Spotify. */
  readonly is_local: boolean
  /** `null` for an entry Spotify will no longer serve. */
  readonly item: Item | null
}

/** A page of entries. Spotify caps `limit` at 50, so a long playlist is several. */
export interface ItemsPage {
  readonly items: readonly PlaylistEntry[]
}
