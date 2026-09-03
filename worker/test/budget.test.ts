import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { PlaylistTracks } from '@jukebox/schema'
import { pagesHolding, pagesOf } from '../src/sources/spotify/__fixtures__/network'
import type { ItemsResponse } from '../src/sources/spotify/payloads'
import { tracksOf } from './api'
import { holdingD1sLimits } from './bindings'
import { FIRST, SECOND, readPages, tracked } from './resolutions'

/**
 * What a Resolution costs D1, and that a longer Playlist does not cost more.
 *
 * The rest of the suite asks whether a Resolution is *right*. This one asks
 * whether it is affordable, which is a separate property and the one nothing
 * held: D1 gives an invocation a thousand queries and counts each statement in
 * a batch as one, so a write costing a statement per Track stops working
 * somewhere past four hundred of them. Issue #26, and ADR-0009 for what
 * replaced it.
 *
 * Driven against Spotify rather than the stub, because the stub answers every
 * read with the same three Tracks -- deliberately -- and a Source that can be
 * asked for five thousand is the one thing these need.
 */

/** D1's own ceiling: the queries one Worker invocation is given, on Workers Paid. */
const BUDGET = 1000

/**
 * Several thousand, and ten times what the old write could store.
 *
 * Spotify's own ceiling on a playlist is 10,000 entries and the adapter walks
 * all of them, so this is not a number chosen to be safely large -- it is half
 * of what a Source will really hand over.
 */
const LONG = 5_000

/**
 * Spotify's own ceiling on a playlist, and so the longest Playlist any
 * Resolution will ever be handed.
 *
 * Its own test because it is where the second limit bites. The `tracks`
 * document for a Playlist this long serializes past the 2 MB D1 allows one
 * bound string, so this is the case that says the cutter cuts -- and the case
 * that fails if `PIECE` is ever raised past what the limit allows.
 */
const CEILING = 10_000

/**
 * One Resolution against a D1 that will not answer past the budget, and what it
 * spent getting there.
 *
 * The `POST` that tracks the Playlist is not counted, and should not be: the
 * budget is per invocation, and adding a Playlist is a different invocation
 * from the queue delivery that resolves it.
 */
const costOf = async (
  id: string,
  at: number,
  pages: readonly ItemsResponse[],
): Promise<string[]> => {
  const spent: string[] = []

  await readPages(id, pages, { at, bindings: { DB: holdingD1sLimits(env.DB, BUDGET, spent) } })

  return spent
}

describe('a Playlist of several thousand entries', () => {
  it('resolves inside the queries D1 gives one invocation', async () => {
    const sourceId = 'B1AAAAAAAAAAAAAAAAAAAA'
    const id = await tracked(sourceId)

    const spent = await costOf(id, FIRST, pagesOf(LONG, sourceId))

    // The Resolution completing at all is most of what this asserts: past the
    // budget the stand-in refuses the way D1 does, and the message the queue
    // gets back is the one that would have been retried until it dead-lettered.
    expect(spent.length).toBeLessThanOrEqual(BUDGET)
  })

  it('comes back over HTTP holding every Track its Source offered', async () => {
    const sourceId = 'B2AAAAAAAAAAAAAAAAAAAA'
    const id = await tracked(sourceId)

    await costOf(id, FIRST, pagesOf(LONG, sourceId))

    const body = (await (await tracksOf(id)).json()) as PlaylistTracks

    // Affordable and complete are two things, and a write that quietly stored
    // some of what it was offered would satisfy the first on its own.
    expect(body.tracks).toHaveLength(LONG)
    expect(body.tracks.at(-1)?.position).toBe(LONG - 1)
  })
})

describe('what a Resolution costs D1', () => {
  it('does not grow with the number of Tracks in the Playlist', async () => {
    const shortId = 'B3AAAAAAAAAAAAAAAAAAAA'
    const longId = 'B4AAAAAAAAAAAAAAAAAAAA'

    const few = await costOf(await tracked(shortId), FIRST, pagesOf(5, shortId))
    const many = await costOf(await tracked(longId), FIRST, pagesOf(LONG, longId))

    // A thousand times the Tracks, for a handful more queries. What is left of
    // the difference is the `tracks` document being cut into pieces, which
    // ADR-0009 sizes; everything else about a Resolution costs what it costs
    // whatever the Playlist holds.
    //
    // Bounded rather than pinned. The exact count is a function of how long the
    // titles are, and a test naming it would fail on a fixture edit that broke
    // nothing.
    expect(few.length).toBeLessThan(10)
    expect(many.length).toBeLessThan(few.length + 10)
  })
})

describe('a Playlist at the longest its Source will serve', () => {
  it('is recorded without binding more than D1 carries in one string', async () => {
    const sourceId = 'B7AAAAAAAAAAAAAAAAAAAA'
    const id = await tracked(sourceId)

    // Ten thousand Tracks is more JSON than one bound parameter may hold, so
    // this passes only because the document was cut. The stand-in refuses an
    // over-long string the way D1 does, which is what makes that a test rather
    // than an argument.
    const spent = await costOf(id, FIRST, pagesOf(CEILING, sourceId))

    expect(spent.length).toBeLessThanOrEqual(BUDGET)

    const body = (await (await tracksOf(id)).json()) as PlaylistTracks
    expect(body.tracks).toHaveLength(CEILING)
  })
})

describe('a long Playlist whose Tracks have all moved', () => {
  it('is re-placed inside the same budget', async () => {
    const sourceId = 'B5AAAAAAAAAAAAAAAAAAAA'
    const id = await tracked(sourceId)
    const order = [...Array(LONG).keys()]

    await readPages(id, pagesOf(LONG, sourceId), { at: FIRST })

    // Reversed, so every Track is somewhere it was not -- LONG is even, so not
    // one of them keeps its position. This is the write the issue never
    // counted: re-placing a Track cost a query of its own, and there was one
    // per Track that moved.
    const spent = await costOf(id, SECOND, pagesHolding([...order].reverse(), sourceId))

    expect(spent.length).toBeLessThanOrEqual(BUDGET)

    const body = (await (await tracksOf(id)).json()) as PlaylistTracks
    expect(body.tracks).toHaveLength(LONG)
    expect(body.tracks.at(0)?.title).toBe(`Track ${LONG - 1}`)
  })
})

describe('a long Playlist its Source has emptied', () => {
  it('is left holding no Tracks, inside the same budget', async () => {
    const sourceId = 'B6AAAAAAAAAAAAAAAAAAAA'
    const id = await tracked(sourceId)

    await readPages(id, pagesOf(LONG, sourceId), { at: FIRST })

    // The other write the issue never counted. A Track the Source no longer
    // lists was marked Removed one at a time, so emptying a long Playlist cost
    // as much as filling it had.
    const spent = await costOf(id, SECOND, [{ items: [], next: null }])

    expect(spent.length).toBeLessThanOrEqual(BUDGET)

    const body = (await (await tracksOf(id)).json()) as PlaylistTracks
    expect(body.tracks).toEqual([])
  })
})
