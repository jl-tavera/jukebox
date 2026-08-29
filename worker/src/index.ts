import { Hono } from 'hono'
import type { CreatePlaylistRequest } from '@jukebox/schema'
import { errorBody } from './errors'
import { findSource } from './sources/registry'

const app = new Hono<{ Bindings: Env }>()

app.post('/playlists', async (c) => {
  // Partial, because nothing has checked the body yet: it is whatever the caller
  // sent, described by the shape the contract asks for.
  const body = await c.req
    .json<Partial<CreatePlaylistRequest>>()
    .catch((): Partial<CreatePlaylistRequest> => ({}))
  const url = typeof body.url === 'string' ? body.url : ''

  if (findSource(url)) {
    // An invariant, not an error response: the registry is empty, so nothing can
    // claim anything. #9 registers the first adapter and implements this branch.
    throw new Error(`unimplemented: a Source claims ${url}`)
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

export default {
  fetch: app.fetch,
}
