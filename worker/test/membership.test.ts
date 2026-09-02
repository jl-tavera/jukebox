import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { FIRST, SECOND, TRACK, readTwice } from './resolutions'

/**
 * What D1 holds about a Playlist's membership after a Resolution that read
 * something different from the one before it.
 *
 * DESIGN section 02's reason for keeping D1 at all is that the KV snapshots can
 * be rebuilt from it, and issue #25 is what finally rebuilds one. That turns
 * these rows from a record nothing reads into the answer a reader gets, so
 * "add-only is fine for now" -- migration 0003's position -- stops being true
 * here. See docs/adr/0008-membership-is-made-current-by-its-writer.md.
 */

interface Membership {
  track_id: string
  position: number
  added_at: number
  removed_at: number | null
}

const membershipOf = async (id: string): Promise<Membership[]> => {
  const { results } = await env.DB.prepare(
    `SELECT track_id, position, added_at, removed_at FROM playlist_tracks
      WHERE playlist_id = ? ORDER BY track_id`,
  )
    .bind(id)
    .all<Membership>()

  return results
}

describe('a Resolution that reads different contents', () => {
  it('marks a Track the Source no longer lists as Removed', async () => {
    // Entry 1 was in the Playlist and is not offered the second time. Left
    // alone it would keep a row with no `removed_at`, and a rebuild would go on
    // serving a Track the Source has stopped listing -- which is data the
    // reader would have no way to know was stale.
    const id = await readTwice('1EEEEEEEEEEEEEEEEEEEEE', [0, 1, 2], [0, 2, 4])

    const departed = (await membershipOf(id)).find((row) => row.track_id === TRACK[1])

    // The instant it left, not the instant it joined: `CONTEXT.md` keeps the
    // local record along with the moment it went.
    expect(departed).toMatchObject({ removed_at: SECOND, added_at: FIRST })
  })

  it('re-places a Track that moved rather than recording it twice', async () => {
    // Entry 2 was third and is now second. A Track is in a Playlist at most
    // once at a time -- migration 0003 -- so the row moves rather than a second
    // one appearing beside it.
    const id = await readTwice('2EEEEEEEEEEEEEEEEEEEEE', [0, 1, 2], [0, 2, 4])

    const moved = (await membershipOf(id)).filter((row) => row.track_id === TRACK[2])

    expect(moved).toHaveLength(1)
    // Still the instant it joined: it never left, so nothing about when it
    // arrived changed.
    expect(moved[0]).toMatchObject({ position: 1, removed_at: null, added_at: FIRST })
  })

  it('leaves a Track that did not move alone', async () => {
    // Entry 0 is first in both reads. The cheapest thing to get wrong here is
    // rewriting every row every time, which would reset `added_at` and lose the
    // history the column exists for.
    const id = await readTwice('3EEEEEEEEEEEEEEEEEEEEE', [0, 1, 2], [0, 2, 4])

    const stayed = (await membershipOf(id)).find((row) => row.track_id === TRACK[0])

    expect(stayed).toMatchObject({ position: 0, removed_at: null, added_at: FIRST })
  })

  it('records a Track the Source has added', async () => {
    const id = await readTwice('4EEEEEEEEEEEEEEEEEEEEE', [0, 1, 2], [0, 2, 4])

    const arrived = (await membershipOf(id)).find((row) => row.track_id === TRACK[4])

    expect(arrived).toMatchObject({ position: 2, removed_at: null, added_at: SECOND })
  })

  it('leaves exactly the Tracks the Source last offered present', async () => {
    const id = await readTwice('5EEEEEEEEEEEEEEEEEEEEE', [0, 1, 2], [0, 2, 4])

    const present = (await membershipOf(id))
      .filter((row) => row.removed_at === null)
      .sort((one, other) => one.position - other.position)

    // The whole point, stated as the list a rebuild would serve. Everything
    // above is one row of this.
    expect(present.map((row) => [row.track_id, row.position])).toEqual([
      [TRACK[0], 0],
      [TRACK[2], 1],
      [TRACK[4], 2],
    ])
  })
})

describe('a Playlist the Source has emptied', () => {
  it('is left holding no Tracks rather than the ones it had', async () => {
    // The case an early `return` on an empty list gets wrong, and the one a
    // Playlist emptied upstream actually is. Nothing to insert is not nothing
    // to do.
    const id = await readTwice('6EEEEEEEEEEEEEEEEEEEEE', [0, 1], [])

    const present = (await membershipOf(id)).filter((row) => row.removed_at === null)

    expect(present).toEqual([])
  })
})
