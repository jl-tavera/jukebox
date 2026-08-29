/**
 * The lookup every route and consumer goes through to reach a Source. Nothing
 * outside this directory imports an adapter directly -- that is what keeps
 * Apple Music and YouTube additive rather than an audit of every call site.
 */
export interface PlaylistSource {
  readonly id: 'spotify' | 'apple' | 'youtube'

  /** Does this adapter own this URL? Cheap, no network. */
  claims(url: string): boolean
}

/**
 * Empty until the Spotify adapter lands (#9), which is why every URL is
 * currently unclaimed. The seam exists now so that ticket adds a Source rather
 * than a code path.
 */
const sources: PlaylistSource[] = []

export const findSource = (url: string): PlaylistSource | undefined =>
  sources.find((source) => source.claims(url))
