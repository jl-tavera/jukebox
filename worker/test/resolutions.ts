import { vi } from 'vitest'
import {
  CREDENTIALS,
  pageOffering,
  spotifyServing,
} from '../src/sources/spotify/__fixtures__/network'
import type { ItemsResponse } from '../src/sources/spotify/payloads'
import { createPlaylist, insteadOfTheNetwork, resolvePlaylist } from './api'

/**
 * A Playlist read more than once, from a Source that can say something
 * different each time.
 *
 * Here rather than in one suite because two of them need it and neither owns
 * it. Driven against Spotify because the stub answers every read with the same
 * fixed set -- deliberately, since the pipeline is what it is there to test --
 * and a Source that cannot change its mind is the one thing these need it to do.
 */

/**
 * Two instants a minute apart, so `added_at` says which Resolution wrote a row.
 *
 * A minute rather than a moment, and the clock is held rather than allowed to
 * run: membership records the instant a Track joined, so two Resolutions in the
 * same second collide on it and a test could pass on the collision rather than
 * on the behaviour. `redelivery.test.ts` names the same hazard.
 */
export const FIRST = 1_700_000_000
export const SECOND = 1_700_000_060

/** The Track each captured entry becomes, by the index `pageOffering` selects it with. */
export const TRACK = [
  'spotify:4rzfv0JLZfVhOhbSQ8o5jZ',
  'spotify:5o3jMYOSbaVz3tkgwhELSV',
  'spotify:4Cy0NHJ8Gh0xMdwyM9RkQm',
  'spotify:6hvFrZNocdt2FcKGCSY5NI',
  'spotify:2E2znCPaS8anQe21GLxcvJ',
] as const

/** Tracks a Spotify Playlist by its Source id, and answers the id it is stored under. */
export const tracked = async (sourceId: string): Promise<string> => {
  await createPlaylist(`https://open.spotify.com/playlist/${sourceId}`)
  return `spotify:${sourceId}`
}

/**
 * One Resolution of `id`, against a Source offering exactly `entries`, at `at`.
 *
 * `bindings` is how a caller stops it part way -- the same trick the rest of the
 * suite uses, at the same boundary. Nothing in `src/` knows it happened.
 */
export const readOffering = (
  id: string,
  entries: readonly number[],
  { at, bindings }: { at: number; bindings?: Partial<Env> },
): Promise<void> => readPages(id, [pageOffering(...entries)], { at, bindings })

/**
 * The same, for a Source whose answer is already cut into pages.
 *
 * `readOffering` above arranges the five captured entries, which is every
 * question about *which* Tracks a Playlist holds. This is the one it cannot
 * ask: a Playlist long enough that what a Resolution costs is the question, and
 * that needs pages `pagesOf` and `pagesHolding` build rather than one page of
 * captures.
 */
export const readPages = async (
  id: string,
  pages: readonly ItemsResponse[],
  { at, bindings = {} }: { at: number; bindings?: Partial<Env> },
): Promise<void> => {
  const clock = vi.spyOn(Date, 'now')

  try {
    clock.mockReturnValue(at * 1000)

    await insteadOfTheNetwork(spotifyServing(...pages).answer, () =>
      resolvePlaylist(id, { ...CREDENTIALS, ...bindings }),
    )
  } finally {
    clock.mockRestore()
  }
}

/** A Playlist read twice, offering `first` and then `second`. Both succeed. */
export const readTwice = async (
  sourceId: string,
  first: readonly number[],
  second: readonly number[],
): Promise<string> => {
  const id = await tracked(sourceId)

  await readOffering(id, first, { at: FIRST })
  await readOffering(id, second, { at: SECOND })

  return id
}
