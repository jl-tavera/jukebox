import type {
  CreatePlaylistResponse,
  ErrorCode,
  ErrorEnvelope,
  PlaylistId,
  PlaylistTracks,
  Track,
} from '@jukebox/schema'

/**
 * The two routes the API has, each answered as the thing it means rather than as
 * a `Response` for a command to interpret.
 *
 * The statuses are the contract's, and branching on them is this module's whole
 * job: a command should be reading "still resolving" and "the Source refuses
 * this", not `202` and `410`. What comes back off an error is the server's own
 * `message`, carried verbatim -- which is what the envelope was designed for, and
 * why that copy can improve without a client release.
 *
 * An answer the contract does not describe is thrown rather than folded into one
 * that it does. Both sides generate from `openapi.yaml`, so a shape that does not
 * fit is a bug somewhere in this repository, and `main`'s catch-all says exactly
 * that: a problem Jukebox has no answer for.
 */

/**
 * How long one request may take.
 *
 * Deliberately not called patience: `boot.ts`'s `Patience` is how long a command
 * waits in total and how often it asks again, and this is the unrelated question
 * of how long one socket may stay silent. A caller's window bounds the gaps
 * between requests and nothing inside one, so without this a socket that accepts
 * and then says nothing would sit in a single fetch for as long as the operating
 * system allowed.
 *
 * So the real ceiling on `add` is its window plus one of these, not the window.
 * That is bounded, which is what "it never hangs" claims, and it is more than the
 * window, which the window alone would have implied.
 */
const REPLY_WITHIN_MS = 10_000

/**
 * The two ways an answer can be no, shared by both routes because a caller
 * branches on them identically and a second declaration is a second place for
 * them to drift.
 */
export type Refused = { kind: 'refused'; code: ErrorCode; message: string }
export type Unreachable = { kind: 'unreachable'; message: string }

/**
 * The API's answer to being asked to track a URL.
 *
 * No `status`. The contract carries one -- `pending` or `ok` -- and it is checked
 * on the way through, because a body without it is not the body the contract
 * describes. It is not handed on, because nothing branches on it: the poll asks
 * once before it waits, so a Playlist whose Tracks are already there answers the
 * first ask and never sees the loop. A field nothing reads is the same mistake as
 * a column nothing computes.
 */
export type Created = { kind: 'tracked'; id: PlaylistId } | Refused | Unreachable

/**
 * The API's answer to being asked for a Playlist's Tracks.
 *
 * `unchanged` carries nothing because nothing came back: it is the answer to a
 * conditional ask, and it means the caller's own record is already current. A
 * caller that holds no Version never receives it.
 */
export type Held =
  | { kind: 'snapshot'; snapshot: PlaylistTracks }
  | { kind: 'unchanged' }
  | { kind: 'resolving' }
  | Refused
  | Unreachable

/**
 * Starts tracking a URL, and answers with the id the Playlist is tracked under.
 *
 * Nothing is read from the Source by this request; the Playlist is recorded on
 * the strength of its address alone, and the Resolution happens out of band.
 * Which is why the id is the whole of a useful answer: there is nothing to hand
 * over yet, and the caller's next move is to ask for it.
 */
export const createPlaylist = async (api: string, url: string): Promise<Created> => {
  const answer = await asked(`${api}/playlists`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (answer.kind === 'unreachable') return answer

  const { response, body } = answer

  if (response.status === 200 || response.status === 202) {
    const id = tracked(body)
    if (id === undefined) throw new Error('the API described a Playlist it did not name')

    return { kind: 'tracked', id }
  }

  return refused(response, body)
}

/**
 * A Playlist's Tracks, or the reason there are none to hand over.
 *
 * One request answers both "is it ready" and "here they are", which is what lets
 * the poll loop and the fetch be the same call.
 *
 * `holding` is the Version the caller already has, and passing it is what makes
 * a Sync cost nothing: the Version is the ETag, so an unchanged Playlist comes
 * back as a bare `304`. It defaults to asking unconditionally because that is
 * what `add` wants -- an add reports the title, the count and the Skipped, and
 * cannot do that from an answer with no body -- and because a Playlist that has
 * never resolved has no Version to send.
 */
export const playlistTracks = async (
  api: string,
  id: PlaylistId,
  holding: number | null = null,
): Promise<Held> => {
  const answer = await asked(`${api}/playlists/${encodeURIComponent(id)}/tracks`, {
    headers: {
      accept: 'application/json',
      // Quoted, and strong: the Version names one immutable snapshot exactly
      // rather than an equivalent one, which is how the worker sends it and so
      // the only spelling it recognises coming back.
      ...(holding === null ? {} : { 'if-none-match': `"${holding}"` }),
    },
  })

  if (answer.kind === 'unreachable') return answer

  const { response, body } = answer

  // First, because it is the answer this route gives most often and the only one
  // with nothing in it to read. Everything below reaches for a body.
  if (response.status === 304) return { kind: 'unchanged' }

  if (response.status === 200) {
    const snapshot = readSnapshot(body)
    if (snapshot === undefined) throw new Error('the API answered with something that is not a snapshot')

    return { kind: 'snapshot', snapshot }
  }

  // Deliberately not an empty Track list: a Playlist with no Tracks yet and one
  // that resolved to nothing are different answers, and a client that cannot
  // tell them apart stops waiting too early.
  if (response.status === 202) return { kind: 'resolving' }

  return refused(response, body)
}

/**
 * One request, and whatever came back with it.
 *
 * A request that never arrives is the caller's business rather than an exception,
 * because "the network is not there" is an answer a command has words for. A
 * request that arrives and is not what the contract describes is not.
 */
const asked = async (
  url: string,
  init: RequestInit,
): Promise<{ kind: 'answered'; response: Response; body: unknown } | Unreachable> => {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REPLY_WITHIN_MS) })
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    return {
      kind: 'unreachable',
      message: `Jukebox could not reach its backend at ${url}: ${cause}.`,
    }
  }

  // Parsed here and not by the caller, so a body that is not JSON is one shape of
  // nothing rather than two. Every answer this API gives carries one except the
  // empty revalidation, and that one falls out of the same catch as a body that
  // would not parse -- which costs nothing, because its caller branches on the
  // status before it looks at what came back.
  const body = await response.json().catch(() => undefined)

  return { kind: 'answered', response, body }
}

/** The four statuses that carry an error envelope, read as the code and the sentence in it. */
const refused = (response: Response, body: unknown): Refused => {
  const envelope = body as ErrorEnvelope | undefined
  const error = envelope?.error

  if (
    typeof error?.code !== 'string' ||
    typeof error?.message !== 'string' ||
    error.message === ''
  ) {
    throw new Error(`the API answered ${response.status} without saying why`)
  }

  return { kind: 'refused', code: error.code, message: error.message }
}

/**
 * The id out of the success body of `POST /playlists`.
 *
 * The status is required to be one the contract names but is not returned: see
 * `Created`. Checking it and dropping it is the point -- a body missing it is not
 * this body, and a caller acting on it would be acting on something the poll has
 * already made moot.
 */
const tracked = (body: unknown): PlaylistId | undefined => {
  const created = body as Partial<CreatePlaylistResponse> | undefined

  if (typeof created?.id !== 'string' || created.id === '') return undefined
  if (created.status !== 'pending' && created.status !== 'ok') return undefined

  return created.id
}

/**
 * A snapshot, read for the fields the Mirror is about to be written from.
 *
 * Checked rather than trusted, and not for the reason `readDiscovery` is
 * forgiving. That document is hand-edited by a person and read by every installed
 * binary, so a reader that refused an unfamiliar value would brick them all. This
 * one is generated from the same contract as the server that wrote it, so a shape
 * that does not fit is a bug -- and the cost of not looking is a row of nulls and
 * empty strings in somebody's Mirror, which no later Sync would ever correct.
 *
 * Unknown fields are ignored, so the API gaining one does not stop this working.
 */
const readSnapshot = (body: unknown): PlaylistTracks | undefined => {
  if (typeof body !== 'object' || body === null) return undefined

  const held = body as Record<string, unknown>

  if (typeof held['version'] !== 'number') return undefined
  if (typeof held['skipped'] !== 'number') return undefined
  if (!Array.isArray(held['tracks'])) return undefined

  const tracks: Track[] = []
  for (const entry of held['tracks']) {
    const track = readTrack(entry)
    if (track === undefined) return undefined
    tracks.push(track)
  }

  return {
    version: held['version'],
    title: typeof held['title'] === 'string' ? held['title'] : null,
    skipped: held['skipped'],
    tracks,
  }
}

const readTrack = (entry: unknown): Track | undefined => {
  if (typeof entry !== 'object' || entry === null) return undefined

  const track = entry as Record<string, unknown>

  if (typeof track['sourceTrackId'] !== 'string' || track['sourceTrackId'] === '') return undefined
  if (typeof track['title'] !== 'string') return undefined
  if (typeof track['position'] !== 'number') return undefined

  const artists = Array.isArray(track['artists'])
    ? track['artists'].filter((artist): artist is string => typeof artist === 'string')
    : []

  return {
    sourceTrackId: track['sourceTrackId'],
    title: track['title'],
    artists,
    album: text(track['album']),
    durationMs: typeof track['durationMs'] === 'number' ? track['durationMs'] : null,
    isrc: text(track['isrc']),
    position: track['position'],
    coverImageUrl: text(track['coverImageUrl']),
  }
}

/** A string the contract allows to be absent, with every other spelling of absent folded in. */
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
