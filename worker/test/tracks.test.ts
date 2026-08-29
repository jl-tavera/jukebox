import { describe, expect, it } from 'vitest'
import type { ErrorEnvelope } from '@jukebox/schema'
import { createPlaylist, tracksOf } from './api'

describe('GET /playlists/{id}/tracks', () => {
  it('answers Pending for a Playlist nothing has resolved yet', async () => {
    await createPlaylist('https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n')

    const response = await tracksOf('spotify:3cEYpjA9oz9GiPac4AsH4n')

    // This is the poll response: the CLI asks again rather than treating an
    // empty track list as an answer.
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'pending' })
  })

  it('answers the same when the id arrives percent-encoded', async () => {
    await createPlaylist('https://open.spotify.com/playlist/03Xz4NcdaWjZq2T6sKNLui')

    // A colon is legal in a path segment, but a client that escapes it anyway
    // is asking about the same Playlist.
    const response = await tracksOf('spotify%3A03Xz4NcdaWjZq2T6sKNLui')

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'pending' })
  })

  it('says so when nothing is tracking that Playlist', async () => {
    const response = await tracksOf('spotify:0000000000000000000000')

    expect(response.status).toBe(404)

    const { error } = (await response.json()) as ErrorEnvelope
    expect(error.code).toBe('playlist_not_found')

    // Printed verbatim by the CLI, so it has to name the way out rather than
    // leave the reader with a status code.
    expect(error.message).toMatch(/add/i)
    expect(error.message).not.toContain('playlist_not_found')
  })
})

