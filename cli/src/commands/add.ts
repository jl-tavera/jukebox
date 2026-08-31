import { defineCommand } from 'citty'
import type { PlaylistId } from '@jukebox/schema'
import { createPlaylist, playlistTracks, type Held } from '../api'
import { MirrorUnopenable, withMirror, type Mirror } from '../mirror'
import { failed, succeeded, type Renderable } from '../outcome'
import { counted, named } from '../phrasing'
import { backend, patienceOf, type Patience } from '../session'
import { applySnapshot, folderNameOf, recordPending, recordRefusal } from '../tracking'

/**
 * `jukebox add <url>`: start tracking a public Playlist, and keep what it holds.
 *
 * The waiting is the shape of this command, and it is not an edge case. Every
 * add is a cold Resolution -- nothing reads a Source until the queue reaches the
 * Playlist -- so a Playlist is Pending at the moment it is asked for, every time.
 * So `add` asks, waits a bounded while, and then stops waiting and says so. It
 * never hangs, and a Playlist that is merely still resolving is never reported as
 * a failure.
 */

/** What `add` has to say, in one object rendered two ways. */
export type Added = {
  id: PlaylistId
  /** The Playlist's own name, or `null` while nothing has read one yet. */
  title: string | null
  /** `ok` once its Tracks are here; `pending` when the wait ran out first. */
  status: 'ok' | 'pending'
  /** How many Tracks the Mirror now holds for it. */
  tracks: number
  /**
   * How many entries its Source offered that never became Tracks, and `null`
   * while that is not known.
   *
   * Reported so that a count lower than the one the Source shows does not read as
   * data loss.
   */
  skipped: number | null
  /** The folder its files will go in, per ADR-0004, once there is a title to name one after. */
  folderName: string | null
}

export const addPlaylist = async (url: string, data: unknown): Promise<Renderable<Added>> => {
  // The boot first, and the Mirror only after it survives.
  //
  // A binary the discovery document refuses under `min_version` is meant to be a
  // hard stop, and a hard stop that has already created and migrated a database
  // is not one: it wrote to the user's disk on the strength of a version the
  // backend had just said it would not serve. The same goes for a run during an
  // outage. Almost every boot is answered from the saved document and costs
  // nothing, so ordering it first costs nothing either.
  const { api } = await backend(data)
  const patience = patienceOf(data)

  try {
    return await withMirror((mirror) => tracking(mirror, api, url, patience))
  } catch (error) {
    if (error instanceof MirrorUnopenable) return failed('add', 'mirror_unopenable', error.message)
    throw error
  }
}

const tracking = async (
  mirror: Mirror,
  api: string,
  url: string,
  patience: Patience,
): Promise<Renderable<Added>> => {
  const created = await createPlaylist(api, url)

  // A URL no Source claims, a Playlist its Source refuses, and a Source that
  // cannot be read. None of the three carries an id, so none of them is recorded
  // here -- there is nothing to record, and a row for a Playlist the server never
  // accepted would be a Playlist only this machine believes in.
  if (created.kind === 'refused') return failed('add', created.code, created.message)
  if (created.kind === 'unreachable') {
    return failed('add', 'network_unreachable', created.message)
  }

  const { id } = created
  recordPending(mirror, { id, url })

  const held = await waitedFor(api, id, patience)

  if (held.kind === 'snapshot') {
    const snapshot = held.snapshot
    applySnapshot(mirror, id, snapshot, Date.now())

    return resolved(id, {
      title: snapshot.title,
      tracks: snapshot.tracks.length,
      skipped: snapshot.skipped,
      folderName: folderNameOf(mirror, id),
    })
  }

  if (held.kind === 'refused') {
    // The Playlist is recorded by now, so what the Source said about it is worth
    // recording too -- `list` should not go on calling it Pending when the answer
    // has arrived and is a permanent one.
    recordRefusal(mirror, id, held.code)

    return failed('add', held.code, held.message)
  }

  if (held.kind === 'unreachable') {
    return failed('add', 'network_unreachable', held.message)
  }

  if (held.kind === 'resolving') return stillResolving(id)

  // `unchanged` is the one answer `add` cannot be given: it never sends a
  // Version, and the API only answers this to a caller that did. Named and
  // thrown rather than left to fall into the branch above, because a Playlist
  // reported as still being read when the server said "you already have this"
  // would be a wrong answer rather than a missing one -- and this is where an
  // `add` that started asking conditionally would find out.
  throw new Error('the API answered a conditional request that add never made')
}

/**
 * Asks for the Playlist's Tracks until they arrive or the patience runs out.
 *
 * Asked once immediately and then on the interval, which needs no special case
 * for a Playlist the server said was already resolved: that one answers on the
 * first ask and never sees the loop.
 *
 * The window is checked before sleeping rather than after, so the command cannot
 * spend an interval waiting for a request it has no time left to make. Together
 * with the timeout on each request in `api.ts`, that is the whole of "it never
 * hangs".
 */
const waitedFor = async (api: string, id: PlaylistId, patience: Patience): Promise<Held> => {
  const deadline = Date.now() + patience.windowMs

  for (;;) {
    const held = await playlistTracks(api, id)
    if (held.kind !== 'resolving') return held

    if (Date.now() + patience.intervalMs > deadline) return held
    await Bun.sleep(patience.intervalMs)
  }
}

const resolved = (
  id: PlaylistId,
  { title, tracks, skipped, folderName }: Omit<Added, 'id' | 'status'> & { skipped: number },
): Renderable<Added> =>
  succeeded(
    'add',
    { id, title, status: 'ok', tracks, skipped, folderName },
    () =>
      `Tracking ${named(title, id)}.\n` +
      `${counted(tracks, 'track', 'tracks')}, ${skippedly(skipped)}.`,
  )

/**
 * Tracked, and its Tracks are not here yet. A success: the Playlist is recorded,
 * the Resolution is under way, and the next Sync will pick it up. A command that
 * failed on the answer it receives most often could not be put in a script.
 */
const stillResolving = (id: PlaylistId): Renderable<Added> =>
  succeeded(
    'add',
    { id, title: null, status: 'pending', tracks: 0, skipped: null, folderName: null },
    () =>
      `Tracking ${id}.\n` +
      'It is still being read from its source. Run `jukebox sync` in a moment to pick up its tracks.',
  )

/** Always said, including when it is none, so its absence never has to be interpreted. */
const skippedly = (skipped: number): string =>
  skipped === 0 ? 'nothing skipped' : `${counted(skipped, 'entry', 'entries')} skipped`

export const add = defineCommand({
  meta: {
    name: 'add',
    description: 'Start tracking a public playlist and keep a record of what is in it',
  },
  args: {
    // Required without saying so: citty treats a positional with no default as
    // required and refuses a missing one before `run` is reached, throwing the
    // `CLIError` that `main` turns into `invalid_usage`. Its usage line says
    // `(Required)` for the same reason.
    url: {
      type: 'positional',
      description: 'The playlist address, copied from your browser',
    },
  },
  // Asserted because citty's own type cannot narrow on what it enforces: the
  // shape it infers `required` from declares that field `boolean`, so a
  // positional reads as possibly absent however it is written. By here it is not.
  run: ({ args, data }) => addPlaylist(args.url!, data),
})
