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
import { readHead, readSnapshot } from './snapshots'
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
 * The answer for a Playlist being served at `version`: the snapshot stored under
 * it, or the empty revalidation for a caller that already holds it.
 *
 * The conditional check is first, and nothing above it reads anything. That is
 * DESIGN section 05's cheap path -- "no D1 query, no snapshot read, no JSON
 * parse" -- and this function is where it is enforced now that two routes reach
 * it, so reordering the halves below is the regression that section warns about
 * even if every test still passes.
 *
 * Written once because the Version arrives two ways and the answer must not
 * depend on which. Head is the ordinary one. The other is the Playlist row,
 * which names the same Version whenever the cache cannot answer for head yet --
 * and a client cannot tell one body from the other, which is what makes the
 * second a fallback rather than a second contract.
 */
const served = async (c: Context<{ Bindings: Env }>, id: string, version: string) => {
  // Strong, because the Version names an immutable snapshot exactly rather than
  // an equivalent one -- so it is built once here and sent with the answer
  // whether or not there is a body under it.
  const etag = `"${version}"`

  if (holdsVersion(c.req.header('if-none-match'), version)) {
    // The whole of a sync that has nothing to do: no body, and a client that
    // already agrees with us.
    return c.body(null, 304, { etag, 'cache-control': REVALIDATE })
  }

  const snapshot = await readSnapshot(c.env.CACHE, id, version)

  // Neither route here names a Version whose snapshot was not written first, so
  // reaching this means the cache lost a key it was promised to keep. It is not
  // a state the contract has an answer for, and inventing one would hide it.
  // Rebuilding the document from D1 instead needs `skipped`, which D1 does not
  // store; issue #25 holds the schema change that would let it.
  if (snapshot === null) {
    throw new Error(`nothing stored for ${id} at version ${version}`)
  }

  // The stored document is the response body, served as the bytes it was
  // written as.
  return c.body(snapshot, 200, {
    'content-type': 'application/json',
    etag,
    'cache-control': REVALIDATE,
  })
}

app.get('/playlists/:id/tracks', async (c) => {
  const id = c.req.param('id')

  // Head first, and alone: everything a conditional request costs is this one
  // read and the comparison `served` makes on it. Moving the row read below
  // above this line would answer the same in every case and cost the common one
  // everything DESIGN section 05 built it to save.
  const head = await readHead(c.env.CACHE, id)
  if (head !== null) return served(c, id, head)

  const stored = await readStatusAndVersion(c.env.DB, id)

  if (stored === undefined) {
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

  if (stored.status === 'pending') {
    const pending: PendingTracks = { status: 'pending' }
    return c.json(pending, 202)
  }

  // Reached by a Playlist with no Version being served, because head is read
  // first: one that resolved before and has since gone keeps being served the
  // Tracks it already has, which is DESIGN section 09's rule that a remote
  // failure never costs a reader what they already had.
  //
  // Neither gets the fallback below, and one narrow case pays for that: a
  // redelivery of an already-successful Resolution can mark a Playlist Gone
  // without touching its Version, so a reader inside the window described below
  // would be refused Tracks that are still stored. It is older than the fallback
  // rather than made by it, and covering it is a wider change than serving a
  // Version. Recorded on #25, which owns what the cold path answers.
  if (stored.status === 'gone') return c.json(errorBody('playlist_gone', GONE), 410)
  if (stored.status === 'unreachable') {
    return c.json(errorBody('source_unavailable', UNAVAILABLE), 503)
  }

  // `ok`, and head could not say so. Not an impossible state and not an empty
  // cache: KV caches a miss as readily as a hit, for up to a minute in whichever
  // location made it, so a client polling for Tracks that were not written yet
  // leaves the absence of head cached behind it and goes on reading `null` from
  // a key that now exists. Reproduced against staging on issue #13.
  //
  // The row is the way out, and one it can be trusted with: it is moved to a
  // Version only after the snapshot under that Version is written and head names
  // it, so a row saying `ok` at Version n is a promise that n was servable. The
  // key holding it has never been asked for while absent either -- nothing reads
  // a snapshot before head names one -- so no negative cache stands over it.
  //
  // A conditional request landing here pays a D1 read the cheap path does not,
  // which section 05 forbids of *that* path and not of this one: it is reached
  // only when head has already answered `null`, so nothing common is slower.
  //
  // `String` cannot spell the key differently from the one `writeSnapshot` used.
  // Both start from the same integer -- the column is INTEGER and `markResolved`
  // binds the number the snapshot was written under -- and an integer has one
  // decimal spelling.
  return served(c, id, String(stored.version))
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
