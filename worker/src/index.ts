import { Hono } from 'hono'
import type {
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  PendingTracks,
} from '@jukebox/schema'
import { errorBody } from './errors'
import { readStatus, recordPending } from './playlists'
import { resolve, type ResolutionMessage } from './resolution'
import { readHead, readSnapshot } from './snapshots'
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

    // Nothing is read from the Source here -- the Playlist is tracked on the
    // strength of its address alone, and the reading happens out of band. That
    // is what keeps upstream usage proportional to Playlists rather than to the
    // people adding them.
    const { newlyTracked } = await recordPending(c.env.DB, {
      id,
      source: source.id,
      sourceId,
      url,
    })

    // Only the add that started tracking asks for a Resolution. A second add
    // finds the Playlist already there and asks for nothing, so rerunning the
    // command costs the Source nothing.
    if (newlyTracked) {
      const work: ResolutionMessage = { id }
      await c.env.RESOLUTION_QUEUE.send(work)
    }

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
  const id = c.req.param('id')

  // DESIGN section 05: a conditional request is served from the KV head key
  // alone -- "no D1 query, no snapshot read, no JSON parse", and a D1 query on
  // that path is a regression even if it passes tests. So head is read first,
  // and #12's If-None-Match check belongs immediately below this line, above
  // the snapshot read.
  const version = await readHead(c.env.CACHE, id)

  if (version !== null) {
    const snapshot = await readSnapshot(c.env.CACHE, id, version)

    // Head only ever names a snapshot already written, so reaching this means
    // the cache lost a key it was promised to keep. It is not a state the
    // contract has an answer for, and inventing one would hide it.
    if (snapshot === null) {
      throw new Error(`head names a snapshot that is not there: ${id} at version ${version}`)
    }

    // The stored document is the response body, served as the bytes it was
    // written as. The ETag is strong because the Version names an immutable
    // snapshot exactly rather than an equivalent one.
    return c.body(snapshot, 200, {
      'content-type': 'application/json',
      etag: `"${version}"`,
    })
  }

  const status = await readStatus(c.env.DB, id)

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

  // Gone and Unreachable are #12's. A Playlist that is `ok` cannot reach here
  // at all -- head is written before the row says so -- which makes this an
  // invariant rather than an error response.
  throw new Error(`unimplemented: the Tracks of a Playlist that is ${status}`)
})

/**
 * The other entry point. A Resolution never runs in a request: it is asked for
 * by `POST /playlists` and done here, which is what keeps upstream usage
 * proportional to Playlists rather than to the people adding them.
 *
 * A message that throws fails its batch and is delivered again. Retry limits
 * and the dead-letter queue that catches what keeps failing are #12's.
 */
const queue = async (batch: MessageBatch<ResolutionMessage>, env: Env): Promise<void> => {
  for (const message of batch.messages) {
    await resolve(env, message.body.id)
  }
}

export default {
  fetch: app.fetch,
  queue,
} satisfies ExportedHandler<Env, ResolutionMessage>
