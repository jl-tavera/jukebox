import { Hono } from 'hono'
import type {
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  PendingTracks,
} from '@jukebox/schema'
import { errorBody } from './errors'
import { readStatus, recordPending } from './playlists'
import { findSource, playlistId } from './sources/registry'

const app = new Hono<{ Bindings: Env }>()

app.post('/playlists', async (c) => {
  // Partial, because nothing has checked the body yet: it is whatever the caller
  // sent, described by the shape the contract asks for.
  const body = await c.req
    .json<Partial<CreatePlaylistRequest>>()
    .catch((): Partial<CreatePlaylistRequest> => ({}))
  const url = typeof body.url === 'string' ? body.url : ''

  const source = findSource(url)
  if (source) {
    const { sourceId } = source.parse(url)
    const id = playlistId(source.id, sourceId)

    // Nothing is read from the Source here, and nothing is enqueued: this
    // ticket ends at Pending. Resolution is #10's work.
    await recordPending(c.env.DB, { id, source: source.id, sourceId, url })

    const accepted: CreatePlaylistResponse = { id, status: 'pending' }
    return c.json(accepted, 202)
  }

  // A missing, malformed or simply unrecognised URL is one case, not three: no
  // adapter claims any of them, and the reader's next move is the same for each.
  // The message names no Source -- it is the answer given when none of them
  // matched, and CLAUDE.md keeps Source assumptions inside the adapter.
  return c.json(
    errorBody(
      'invalid_url',
      'That does not look like a playlist Jukebox can track. Paste a playlist address ' +
        'copied straight from your browser.',
    ),
    400,
  )
})

app.get('/playlists/:id/tracks', async (c) => {
  // DESIGN section 05: once a Playlist has a Version to compare, a conditional
  // request is served from the KV head key alone -- "no D1 query, no snapshot
  // read, no JSON parse", and a D1 query on that path is a regression even if
  // it passes tests. Nothing here is conditional yet, because a Pending
  // Playlist has no Version to carry, so #12's If-None-Match check belongs
  // above this read rather than after it.
  const status = await readStatus(c.env.DB, c.req.param('id'))

  if (status === 'pending') {
    const pending: PendingTracks = { status: 'pending' }
    return c.json(pending, 202)
  }

  if (status === undefined) {
    // Ids are derived from the URL, so an id nothing tracks is a Playlist that
    // was never added rather than one whose Resolution failed -- which is why
    // this is not the Gone answer.
    return c.json(
      errorBody(
        'playlist_not_found',
        'Jukebox is not tracking that playlist. Add it first with `jukebox add <url>`.',
      ),
      404,
    )
  }

  // An invariant, not an error response: nothing in this ticket resolves a
  // Playlist or fails to, so Pending is the only state one can reach. The
  // Tracks themselves are #10's, and Gone and Unreachable are #12's.
  throw new Error(`unimplemented: the Tracks of a Playlist that is ${status}`)
})

export default {
  fetch: app.fetch,
}
