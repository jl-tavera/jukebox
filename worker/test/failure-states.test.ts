import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { ErrorEnvelope } from '@jukebox/schema'
import { CREDENTIALS, spotifyRefusing } from '../src/sources/spotify/__fixtures__/network'
import { createPlaylist, insteadOfTheNetwork, resolvePlaylist, tracksOf } from './api'
import { refusingToStore } from './bindings'

/**
 * The two ways a Resolution ends without Tracks.
 *
 * `CONTEXT.md` separates them by whether trying again could help, and that is
 * the whole of the difference: Gone is answered and acknowledged, Unreachable
 * is answered and delivered again. Everything else here follows from which of
 * the two a failure is.
 */

const statusOf = async (id: string) =>
  (await env.DB.prepare('SELECT status FROM playlists WHERE id = ?')
    .bind(id)
    .first<{ status: string }>())?.status

/** Adds a Playlist and resolves it against a Source that will not serve it. */
const refusedWith = async (sourceId: string, status: number) => {
  await createPlaylist(`https://open.spotify.com/playlist/${sourceId}`)

  const spotify = spotifyRefusing(status)
  return insteadOfTheNetwork(spotify.answer, () =>
    resolvePlaylist(`spotify:${sourceId}`, CREDENTIALS),
  )
}

describe('a Playlist the Source will not serve', () => {
  it('is not asked for again', async () => {
    // The Source answers the same 404 for a playlist that was deleted, one made
    // private, and one it curates itself -- the two captured 404s are byte for
    // byte identical. None of the three is helped by asking again, so the
    // message is finished rather than failed.
    const result = await refusedWith('1CCCCCCCCCCCCCCCCCCCCC', 404)

    expect(result.retryMessages).toEqual([])
    expect(result.retryBatch).toMatchObject({ retry: false })
  })

  it('is recorded as Gone', async () => {
    await refusedWith('2CCCCCCCCCCCCCCCCCCCCC', 404)

    expect(await statusOf('spotify:2CCCCCCCCCCCCCCCCCCCCC')).toBe('gone')
  })

  it('answers asking for its Tracks with a reason and no hope', async () => {
    await refusedWith('3CCCCCCCCCCCCCCCCCCCCC', 404)

    const response = await tracksOf('spotify:3CCCCCCCCCCCCCCCCCCCCC')

    expect(response.status).toBe(410)

    const { error } = (await response.json()) as ErrorEnvelope
    expect(error.code).toBe('playlist_gone')

    // Both likely causes, because the Source does not say which it is, and a
    // reader told only "gone" would go looking for the wrong one.
    expect(error.message).toMatch(/deleted/i)
    expect(error.message).toMatch(/private/i)
    expect(error.message).toMatch(/curat/i)

    // Printed verbatim by the CLI, and written the way the neighbouring
    // messages are: no code in it, and no Source named -- which one refused is
    // the adapter's business, not the reader's.
    expect(error.message).not.toContain('playlist_gone')
    expect(error.message).not.toMatch(/spotify/i)
  })

  it('says the same thing to someone adding it again', async () => {
    await refusedWith('4CCCCCCCCCCCCCCCCCCCCC', 404)

    const enqueued = vi.spyOn(env.RESOLUTION_QUEUE, 'send')

    try {
      const again = await createPlaylist(
        'https://open.spotify.com/playlist/4CCCCCCCCCCCCCCCCCCCCC',
      )

      // Answered rather than accepted, so nobody polls for Tracks that are not
      // coming -- and nothing is asked of a Source that has already refused.
      expect(again.status).toBe(410)
      expect(((await again.json()) as ErrorEnvelope).error.code).toBe('playlist_gone')
      expect(enqueued).not.toHaveBeenCalled()
    } finally {
      enqueued.mockRestore()
    }
  })
})

describe('a Playlist whose Source could not be reached', () => {
  it('is asked for again', async () => {
    // Failing the delivery is how the worker asks for a retry: the queue
    // redelivers what it could not acknowledge. How many times, and where a
    // message goes once it has run out of attempts, are declared in
    // wrangler.jsonc and enforced by the runtime -- nothing in process can see
    // either, so what is asserted here is the only part the worker decides.
    await expect(refusedWith('1DDDDDDDDDDDDDDDDDDDDD', 500)).rejects.toThrow()
  })

  it('is recorded as Unreachable', async () => {
    await expect(refusedWith('2DDDDDDDDDDDDDDDDDDDDD', 500)).rejects.toThrow()

    expect(await statusOf('spotify:2DDDDDDDDDDDDDDDDDDDDD')).toBe('unreachable')
  })

  it('answers asking for its Tracks with something worth trying again', async () => {
    await expect(refusedWith('3DDDDDDDDDDDDDDDDDDDDD', 500)).rejects.toThrow()

    const response = await tracksOf('spotify:3DDDDDDDDDDDDDDDDDDDDD')

    expect(response.status).toBe(503)

    const { error } = (await response.json()) as ErrorEnvelope
    expect(error.code).toBe('source_unavailable')
    expect(error.message).not.toContain('source_unavailable')
    expect(error.message).not.toMatch(/spotify/i)
  })

  it('says the same thing to someone adding it again, and asks for nothing', async () => {
    await expect(refusedWith('4DDDDDDDDDDDDDDDDDDDDD', 500)).rejects.toThrow()

    const enqueued = vi.spyOn(env.RESOLUTION_QUEUE, 'send')

    try {
      const again = await createPlaylist(
        'https://open.spotify.com/playlist/4DDDDDDDDDDDDDDDDDDDDD',
      )

      // Answered, and nothing asked for. The queue either still has attempts
      // left or has put the message where a person can read it, and a request
      // that asked the Source again would be the "refresh now" button DESIGN
      // section 10 rules out by name. ADR-0003 says why Pending is the one
      // status that does ask, and why this one does not.
      expect(again.status).toBe(503)
      expect(enqueued).not.toHaveBeenCalled()
    } finally {
      enqueued.mockRestore()
    }
  })
})

describe('a Resolution that failed for a reason that is not the Source', () => {
  it('leaves the Playlist where it was', async () => {
    await createPlaylist('stub:playlist:storage-fell-over')

    // The Source answered perfectly well; it was storage that did not. Calling
    // that Playlist Unreachable would tell every reader to try the Source again
    // for a problem the Source never had -- and would leave a 503 standing over
    // a Playlist that has simply not been read yet.
    await expect(
      resolvePlaylist('stub:storage-fell-over', { CACHE: refusingToStore(env.CACHE) }),
    ).rejects.toThrow()

    expect(await statusOf('stub:storage-fell-over')).toBe('pending')
    expect((await tracksOf('stub:storage-fell-over')).status).toBe(202)
  })
})
