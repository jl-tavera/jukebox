import { Hono } from 'hono'
import type { Context } from 'hono'
import type {
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  PendingTracks,
} from '@jukebox/schema'
import { errorBody } from './errors'
import { readStatusAndVersion, recordPending } from './playlists'
import { resolve, type ResolutionMessage } from './resolution'
import { servedBody, servedVersion } from './serving'
import { findSource, playlistId } from './sources/registry'

const app = new Hono<{ Bindings: Env }>()

/**
 * On every answer that carries a Version, and on the empty one that
 * revalidates it.
 *
 * `no-cache` is "hold this, but ask before using it", not "do not store it".
 * Without it a shared cache is free to apply heuristic freshness and stop
 * revalidating, at which point a Version that moves never reaches the client --
 * which is the one thing the whole sync protocol is for.
 */
const REVALIDATE = 'no-cache'

/**
 * Is the caller already holding this Version?
 *
 * Compared tag by tag rather than on the header as a whole, for reasons that
 * cost one line each. RFC 9110 lets `If-None-Match` carry a list; it lets a tag
 * be marked weak, and something between this worker and the client may do that
 * -- an edge that re-encodes a response is the usual cause; and it gives `*` the
 * meaning "whatever you have now", which this only ever answers where a Version
 * exists, so whatever we have is what is being asked about. Getting any of the
 * three wrong fails the same way: a whole snapshot sent to a client that already
 * had it, silently, which is the one cost this endpoint exists to avoid.
 */
const holdsVersion = (header: string | undefined, version: string): boolean =>
  (header ?? '').split(',').some((tag) => {
    const sent = tag.trim().replace(/^W\//, '')
    return sent === '*' || sent === `"${version}"`
  })

/**
 * The copy for the two failure states, written once because both endpoints say
 * them. Adding a Playlist and asking for its Tracks are different questions
 * with the same answer here, and a reader who got different words for the same
 * state would reasonably think they meant different things.
 *
 * Neither names a Source, and neither reaches for one of the words `CONTEXT.md`
 * fences off as near-misses for that term -- provider, platform, service. A
 * Source does not tell a playlist that was deleted from one made private from
 * one it curates itself, so the copy names the likely causes and leaves the
 * culprit unnamed, which is what DESIGN section 03 wants anyway: which Source
 * refused is the adapter's business and not the reader's.
 */
const GONE =
  'That playlist cannot be read, and trying again will not help. It has most likely been ' +
  'deleted or made private -- or it is a curated playlist, and those are closed to other apps.'

const UNAVAILABLE =
  'Jukebox could not read that playlist just now. Nothing is wrong with the playlist itself, ' +
  'so it is worth trying again in a few minutes.'

/**
 * The third, and the only one that is about us rather than about a playlist.
 *
 * It says so, because the difference is the whole reason it is not
 * `source_unavailable`: this playlist is fine, its source is fine, and the
 * copy should not send anybody to look at either. What it does not do is
 * promise a moment -- nothing schedules the re-read that would clear it yet --
 * so it says what will fix it rather than when.
 */
const UNASSEMBLED =
  'Jukebox has that playlist but could not put its tracks together just now. Nothing is ' +
  'wrong with the playlist, and nothing is lost -- it will be readable again once Jukebox ' +
  'has re-read it.'

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

    // The add that started tracking needs no lookup: it knows the Playlist is
    // Pending, because it just made it so. Every other add pays for one read,
    // and buys with it the difference between a Playlist worth polling for, one
    // whose Tracks are already there, and one that will never have any.
    //
    // A row that is not there cannot happen -- nothing deletes one, and the
    // insert above either wrote it or found it -- and Pending is what it would
    // mean if it did, so it is the fallback rather than a branch of its own.
    const status = newlyTracked
      ? 'pending'
      : ((await readStatusAndVersion(c.env.DB, id))?.status ?? 'pending')

    // Nothing left to ask for, and nothing to wait for: the client fetches the
    // Tracks and skips polling entirely.
    if (status === 'ok') {
      const resolved: CreatePlaylistResponse = { id, status: 'ok' }
      return c.json(resolved, 200)
    }

    // The same answer the Tracks endpoint gives, so nobody has to poll to learn
    // a state that will not change. Asking for a Resolution would spend an
    // upstream read on a Source that has already refused this Playlist.
    if (status === 'gone') return c.json(errorBody('playlist_gone', GONE), 410)

    // Answered, and nothing asked for. A Resolution that failed is either still
    // being delivered -- the queue has attempts left -- or has run out of them
    // and is sitting in the dead-letter queue where a person can read it. Asking
    // again here would be the "refresh now" button DESIGN section 10 rules out
    // by name, and this is the case that would really be one: the Source has
    // been read for this Playlist already, and the answer was a failure.
    if (status === 'unreachable') {
      return c.json(errorBody('source_unavailable', UNAVAILABLE), 503)
    }

    // Pending, and this is the one place a request asks for an upstream read of
    // a Playlist already tracked. A Pending Playlist cannot be told apart from
    // one whose enqueue failed after its row was written, and that one has
    // nothing coming ever -- no retry, because no message; no refresh, because
    // nothing schedules one. Recorded as a deviation from both spec #5 and
    // CLAUDE.md's "user requests never trigger an upstream playlist fetch" in
    // docs/adr/0003-a-pending-re-add-asks-again.md, with what bounds it.
    const work: ResolutionMessage = { id }
    await c.env.RESOLUTION_QUEUE.send(work)

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

/**
 * One call answers both "is it ready" and "here they are", so the CLI's poll
 * loop and its fetch are the same request.
 *
 * The order below is the cheap path DESIGN section 05 describes, and it is
 * enforced by what is above each line rather than by a comment: nothing is read
 * before `servedVersion`, and the conditional check is answered before anything
 * reaches for a body. Reordering those two halves is the regression that
 * section warns about even if every test still passes.
 */
app.get('/playlists/:id/tracks', async (c) => {
  const id = c.req.param('id')
  const serving = await servedVersion(c.env, id)

  if (serving.kind === 'untracked') {
    return c.json(
      errorBody(
        'playlist_not_found',
        'Jukebox is not tracking that playlist. Add it first with `jukebox add <url>`.',
      ),
      404,
    )
  }

  // Deliberately not an empty track list: a Playlist with no Tracks yet and one
  // that resolved to nothing are different answers, and a client that cannot
  // tell them apart stops polling too early.
  if (serving.kind === 'pending') {
    const pending: PendingTracks = { status: 'pending' }
    return c.json(pending, 202)
  }

  // Reached only by a Playlist with no Version at all. One that has resolved
  // before and has since gone keeps being served the Tracks it already has --
  // `servedVersion` is where that is decided, and why.
  if (serving.kind === 'refused') {
    return serving.status === 'gone'
      ? c.json(errorBody('playlist_gone', GONE), 410)
      : c.json(errorBody('source_unavailable', UNAVAILABLE), 503)
  }

  // Strong, because the Version names an immutable snapshot exactly rather than
  // an equivalent one -- so it is built once and sent with the answer whether or
  // not there is a body under it.
  const etag = `"${serving.version}"`

  // The whole of a sync that has nothing to do: no body, and a client that
  // already agrees with us. Nothing has been read but head to get here.
  if (holdsVersion(c.req.header('if-none-match'), serving.version)) {
    return c.body(null, 304, { etag, 'cache-control': REVALIDATE })
  }

  const body = await servedBody(c.env, id, serving.version)

  // The cache lost a snapshot and D1 could not honestly put it back. Rare
  // enough that it took until issue #25 to have an answer at all, and the
  // answer is a code the CLI can branch on rather than the bare 500 that stood
  // here -- which was the only response this API ever gave with no envelope.
  if (body.kind === 'missing') {
    return c.json(errorBody('snapshot_unavailable', UNASSEMBLED), 503)
  }

  // Stored or rebuilt, and a reader cannot tell: the same bytes under the same
  // Version, which is what makes the rebuild a fallback rather than a second
  // contract.
  return c.body(body.text, 200, {
    'content-type': 'application/json',
    etag,
    'cache-control': REVALIDATE,
  })
})

/**
 * The other entry point. A Resolution never runs in a request: it is asked for
 * by `POST /playlists` and done here, which is what keeps upstream usage
 * proportional to Playlists rather than to the people adding them.
 *
 * A message that throws fails its batch and is delivered again. How many ride
 * in a batch, how many attempts they get, and where one lands once it has run
 * out of them are all declared in wrangler.jsonc. When to throw at all is
 * `resolve`'s: a Source that will not serve a Playlist is answered and
 * acknowledged, and everything else is thrown so the queue brings it back.
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
