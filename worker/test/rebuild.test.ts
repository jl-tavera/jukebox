import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { ErrorEnvelope } from '@jukebox/schema'
import { createPlaylist, resolvePlaylist, tracksOf, tracksOfWithBindings } from './api'
import { missingTheFirstRead, missingTheSecondRead, refusingToStore } from './bindings'
import { FIRST, SECOND, readOffering, readTwice, tracked } from './resolutions'

/**
 * A cache that has lost a snapshot.
 *
 * DESIGN section 09 answers `KV unavailable` with "fall back to D1 + rebuild
 * snapshot", and until issue #25 nothing rebuilt anything: the read threw a
 * bare `Error` and the caller got a `500` with no envelope and no code, in a
 * contract where every other failure carries one the CLI branches on.
 *
 * The point of every test here is that a reader cannot tell. A rebuilt answer
 * is the stored answer -- same bytes, same Version, same ETag -- or it is not a
 * rebuild, because a client caches what it is given under the Version it is
 * given it with.
 */

/** A resolved Playlist at Version 1, from the Source that reaches no network. */
const resolved = async (name: string) => {
  await createPlaylist(`stub:playlist:${name}`)
  await resolvePlaylist(`stub:${name}`)
  return `stub:${name}`
}

/** Puts a Playlist into a state only a Resolution reaches, without running one. */
const recordStatus = (id: string, status: string) =>
  env.DB.prepare('UPDATE playlists SET status = ? WHERE id = ?').bind(status, id).run()

describe('a Playlist whose snapshot the cache has lost', () => {
  it('is answered from D1 rather than with a 500', async () => {
    const id = await resolved('lost-snapshot')

    const response = await tracksOfWithBindings(id, { CACHE: missingTheSecondRead(env.CACHE) })

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"1"')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('is answered with the bytes the cache would have served', async () => {
    const id = await resolved('rebuilt-exactly')

    const stored = await (await tracksOf(id)).text()
    const rebuilt = await (
      await tracksOfWithBindings(id, { CACHE: missingTheSecondRead(env.CACHE) })
    ).text()

    // Byte for byte, not field by field. A client caches what it is handed
    // under the Version it is handed it with, so two documents that differ at
    // all are two meanings of one Version -- which is what `resolve`'s whole
    // write order exists to prevent. Comparing the text is also what
    // `comparedWithServed` does, so a rebuild that disagreed here would make
    // the next Resolution read as "everything changed".
    expect(rebuilt).toBe(stored)
  })

  it('is not read at all by a caller that already holds the Version', async () => {
    const id = await resolved('lost-but-not-asked-for')

    // The cheap path never reaches the snapshot, so losing it changes nothing
    // about a sync that has nothing to do. This is the control on the two
    // above: without it, "answered from D1" could be true of an endpoint that
    // had quietly stopped serving from the cache at all.
    const response = await tracksOfWithBindings(
      id,
      { CACHE: missingTheSecondRead(env.CACHE) },
      { 'if-none-match': '"1"' },
    )

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })
})

describe('a Playlist resolved before D1 held a count of what was skipped', () => {
  it('is refused with a code rather than a number nobody counted', async () => {
    const id = await resolved('no-count')

    // What migration 0004 left behind: a row resolved while `skipped` lived
    // only inside the KV document. Every other part of the snapshot is still
    // here, and answering with a zero would be the invented number #25 rules
    // out by name -- a list shorter than the Source's, reading as data loss.
    await env.DB.prepare('UPDATE playlists SET skipped = NULL WHERE id = ?').bind(id).run()

    const response = await tracksOfWithBindings(id, { CACHE: missingTheSecondRead(env.CACHE) })

    expect(response.status).toBe(503)

    const { error } = (await response.json()) as ErrorEnvelope
    expect(error.code).toBe('snapshot_unavailable')

    // Printed verbatim by the CLI, written the way its neighbours are: no code
    // in it, and no Source named for a failure the Source had no part in.
    expect(error.message).not.toContain('snapshot_unavailable')
    expect(error.message).not.toMatch(/spotify/i)
  })
})

describe('a Playlist that has Tracks and has since been refused by its Source', () => {
  it('is served the Tracks it already had', async () => {
    const id = await resolved('gone-with-tracks')
    await recordStatus(id, 'gone')

    // A queue may redeliver a Resolution that already succeeded, and one that
    // meets a 404 marks the Playlist Gone without touching its Version. Read
    // through head this Playlist is served, because head is read first; read
    // through the row it used to be refused -- and DESIGN section 09's rule is
    // that a remote failure never costs a reader what they already had.
    const response = await tracksOfWithBindings(id, { CACHE: missingTheFirstRead(env.CACHE) })

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"1"')
  })

  it('is still refused when it never had any', async () => {
    await createPlaylist('stub:playlist:gone-with-nothing')
    await recordStatus('stub:gone-with-nothing', 'gone')

    // The control. A Playlist with no Version has nothing to serve, so it is
    // answered the way it always was -- and the rule above is about serving a
    // Version the row names rather than about ignoring the status.
    const response = await tracksOf('stub:gone-with-nothing')

    expect(response.status).toBe(410)
    expect(((await response.json()) as ErrorEnvelope).error.code).toBe('playlist_gone')
  })

  it('is served them when its Source could not be reached either', async () => {
    const id = await resolved('unreachable-with-tracks')
    await recordStatus(id, 'unreachable')

    const response = await tracksOfWithBindings(id, { CACHE: missingTheFirstRead(env.CACHE) })

    expect(response.status).toBe(200)
  })
})

describe('a rebuild of a Playlist the Source has changed', () => {
  it('serves what the Source last offered, not everything it ever offered', async () => {
    // Two Resolutions, the second reading something different: one entry gone,
    // one moved, one arrived.
    const id = await readTwice('1FFFFFFFFFFFFFFFFFFFFF', [0, 1, 2], [0, 2, 4])

    const stored = await (await tracksOf(id)).text()
    const rebuilt = await (
      await tracksOfWithBindings(id, { CACHE: missingTheSecondRead(env.CACHE) })
    ).text()

    // DESIGN section 02's reason for keeping D1 at all, made executable: the
    // snapshots can be rebuilt from it. An add-only membership would serve the
    // departed entry as well and place the moved one where it used to be, and
    // this is the assertion that would fail.
    expect(rebuilt).toBe(stored)
  })
})

describe('a Playlist whose membership has run ahead of its snapshot', () => {
  it('is refused rather than served the next Version under this one', async () => {
    const id = await tracked('2FFFFFFFFFFFFFFFFFFFFF')
    await readOffering(id, [0, 1, 2], { at: FIRST })

    // A second Resolution that records its Tracks and cannot store its snapshot.
    // `recordTracks` runs first, so this is the state it leaves: the rows are
    // Version 2's, while head and the row both still say Version 1.
    await expect(
      readOffering(id, [0, 2, 4], {
        at: SECOND,
        bindings: { CACHE: refusingToStore(env.CACHE) },
      }),
    ).rejects.toThrow()

    // Now lose Version 1's snapshot. The row still describes Version 1
    // perfectly -- its title, its count, its number -- so the check on the row
    // passes and the Tracks are the only thing that has moved. Serving them
    // would be Version 2's membership under Version 1's ETag, which is the
    // mixture the whole write order exists to prevent.
    const response = await tracksOfWithBindings(id, { CACHE: missingTheSecondRead(env.CACHE) })

    expect(response.status).toBe(503)
    expect(((await response.json()) as ErrorEnvelope).error.code).toBe('snapshot_unavailable')
  })
})

describe('a Playlist holding the same recording twice', () => {
  it('is served the entries the Source offered', async () => {
    const id = await tracked('3FFFFFFFFFFFFFFFFFFFFF')
    await readOffering(id, [0, 1, 0], { at: FIRST })

    // The control, and the behaviour that makes the next test a problem worth
    // having: a Source may list one recording twice, and both entries are the
    // Playlist's. Nothing collapses them on the way to a reader.
    const served = (await (await tracksOf(id)).json()) as { tracks: { position: number }[] }

    expect(served.tracks.map((track) => track.position)).toEqual([0, 1, 2])
  })

  it('is refused a rebuild rather than served a shorter list', async () => {
    const id = await tracked('4FFFFFFFFFFFFFFFFFFFFF')
    await readOffering(id, [0, 1, 0], { at: FIRST })

    // Migration 0003 made a Track present in a Playlist at most once, for this
    // rebuild's sake, and that is exactly what stops these rows representing
    // this Playlist: three entries offered, two rows possible. A rebuild would
    // serve two Tracks under a Version that means three -- a list shorter than
    // the Source's, which is the reader-facing failure `skipped` exists to
    // prevent, arriving by another road.
    const response = await tracksOfWithBindings(id, { CACHE: missingTheSecondRead(env.CACHE) })

    expect(response.status).toBe(503)
    expect(((await response.json()) as ErrorEnvelope).error.code).toBe('snapshot_unavailable')
  })
})
