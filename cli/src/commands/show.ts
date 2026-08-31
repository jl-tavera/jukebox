import { defineCommand } from 'citty'
import { MirrorUnopenable, withMirror, type Mirror } from '../mirror'
import { failed, succeeded, type Renderable } from '../outcome'
import { columns, counted, identified, notTracked, skippedly, stamp } from '../phrasing'
import {
  mirroredTracks,
  playlistNamed,
  type MirroredPlaylist,
  type MirroredTrack,
  type MirroredTracks,
} from '../reading'
import type { MirrorStatus } from '../tracking'

/**
 * `jukebox show <playlist>`: one Playlist, and everything the Mirror holds
 * about it.
 *
 * Reads local state and nothing else -- there is no `backend(data)` here, which
 * is what makes it work with no network at all.
 *
 * Removed Tracks are on the screen, below the ones still in the Playlist and
 * under their own heading. Hiding them would discard the only record anyone has
 * that a Track was ever there: the worker stores what a Playlist contains now,
 * and this row is the whole of what the user's own copy remembers about what it
 * contained before.
 */

/**
 * What `show` has to say, in one object rendered two ways.
 *
 * The Playlist is nested whole rather than spread, so that a caller handles a
 * row from `list` and the one here with the same code. That does put `tracks`
 * in the object twice -- a count under `playlist`, an array beside it -- and
 * they are never in disagreement, because the count is that array's length. A
 * caller may read whichever is cheaper.
 */
export type Shown = { playlist: MirroredPlaylist } & MirroredTracks

export const showPlaylist = async (reference: string): Promise<Renderable<Shown>> => {
  try {
    return await withMirror((mirror) => looked(mirror, reference))
  } catch (error) {
    if (error instanceof MirrorUnopenable) {
      return failed('show', 'mirror_unopenable', error.message)
    }
    throw error
  }
}

const looked = (mirror: Mirror, reference: string): Renderable<Shown> => {
  const playlist = playlistNamed(mirror, reference)
  if (playlist === null) return failed('show', 'playlist_not_tracked', notTracked(reference))

  const held = mirroredTracks(mirror, playlist.id)

  return succeeded('show', { playlist, ...held }, () => human(playlist, held))
}

const human = (playlist: MirroredPlaylist, held: MirroredTracks): string => {
  const note = statusNote(playlist.status)

  return [
    identified(playlist.title, playlist.id),
    holds(playlist, held),
    ...(note === null ? [] : [note]),
    ...listing(held),
  ].join('\n')
}

/**
 * What it holds, counted.
 *
 * The Skipped count is always said, the way `add` says it, because a Skipped
 * entry leaves nothing on the screen for a reader to notice and a total lower
 * than the Source's would otherwise read as data loss. The Removed count is said
 * only when there is one, because when there is not, the absent heading below
 * says the same thing in the same place -- and `list` skips both zeroes for the
 * different reason that it is scanned rather than read.
 */
const holds = (playlist: MirroredPlaylist, { tracks, removed }: MirroredTracks): string => {
  if (tracks.length === 0 && removed.length === 0) return 'No tracks are recorded for it.'

  return (
    [
      counted(tracks.length, 'track', 'tracks'),
      ...(removed.length === 0 ? [] : [`${removed.length} removed`]),
      ...(playlist.skipped === null ? [] : [skippedly(playlist.skipped)]),
    ].join(', ') + '.'
  )
}

/**
 * What its status means, in `CONTEXT.md`'s own terms, and nothing for the
 * ordinary one.
 *
 * A Playlist that is Gone still has Tracks on the screen, and without this line
 * a reader would take them for current. Pending and Unreachable each carry the
 * reader's next move, which is the thing they came for.
 */
const statusNote = (status: MirrorStatus): string | null => {
  if (status === 'pending') {
    return 'It has not been read from its source yet. Run `jukebox sync` to pick up its tracks.'
  }
  if (status === 'gone') {
    return 'Its source will no longer serve it. These are the tracks Jukebox last saw.'
  }
  if (status === 'unreachable') {
    return 'Its source could not be read last time. Jukebox will try again on the next sync.'
  }

  return null
}

const REMOVED_HEADING = 'Removed, and still recorded here:'

/**
 * The two blocks, laid out as one set of columns and then cut in half.
 *
 * Cut afterwards rather than laid out separately, so that the Removed rows line
 * up with the present ones instead of each block being square on its own. That
 * alignment is what lets a reader run an eye down the titles across the gap.
 *
 * Nothing is truncated to a terminal width, and nothing here knows one. `Io`
 * carries `stdoutIsTty` and deliberately not a number of columns, and a long
 * title cut off is a title a reader cannot search for. A narrow terminal wraps,
 * and anybody who wants to slice this has `--json`.
 */
const listing = ({ tracks, removed }: MirroredTracks): string[] => {
  if (tracks.length === 0 && removed.length === 0) return []

  const laid = columns([...tracks.map(row), ...removed.map(row)])

  return [
    ...(tracks.length === 0 ? [] : ['', ...laid.slice(0, tracks.length)]),
    ...(removed.length === 0 ? [] : ['', REMOVED_HEADING, ...laid.slice(tracks.length)]),
  ]
}

/**
 * One Track. The marker is `sync`'s: a leading `-` is already what this CLI
 * writes beside a Track that left a Playlist.
 */
const row = (track: MirroredTrack): string[] => [
  track.removedAt === null ? '' : '-',
  track.title,
  performers(track.artists),
  track.album ?? UNKNOWN,
  duration(track.durationMs),
  track.removedAt === null ? '' : `left ${stamp(track.removedAt)}`,
]

/**
 * What a Source did not say, marked rather than filled in.
 *
 * `CONTEXT.md`'s rule about an absent title generalises to every field it lists:
 * a placeholder is worse than a gap, because nobody downstream can tell one from
 * a real value. An album nobody named must not read as an album called nothing,
 * and a missing duration must not read as `0:00`.
 */
const UNKNOWN = '--'

const performers = (artists: string[]): string =>
  artists.length === 0 ? UNKNOWN : artists.join(', ')

/** `m:ss`, and `h:mm:ss` for the long recordings a classical Catalog is full of. */
const duration = (ms: number | null): string => {
  if (ms === null) return UNKNOWN

  const whole = Math.round(ms / 1000)
  const padded = (value: number): string => String(value).padStart(2, '0')

  const seconds = whole % 60
  const minutes = Math.floor(whole / 60) % 60
  const hours = Math.floor(whole / 3600)

  return hours === 0
    ? `${minutes}:${padded(seconds)}`
    : `${hours}:${padded(minutes)}:${padded(seconds)}`
}

export const show = defineCommand({
  meta: {
    name: 'show',
    description: 'Show one playlist and the tracks recorded for it',
  },
  args: {
    // Required without saying so, as `add`'s is: citty refuses a missing
    // positional before `run` is reached, throwing the `CLIError` that `main`
    // turns into `invalid_usage`.
    playlist: {
      type: 'positional',
      description: 'Its id, as `jukebox list` prints it, or the address you added it with',
    },
  },
  run: ({ args }) => showPlaylist(args.playlist!),
})
