import { defineCommand } from 'citty'
import { withMirror, type Mirror } from '../mirror'
import { failed, succeeded, type Renderable } from '../outcome'
import { fitted, type Move } from '../fitting'
import { ambiguous, counted, named, notTracked, skippedly, stamp } from '../phrasing'
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
  return await withMirror((mirror) => looked(mirror, reference))
}

const looked = (mirror: Mirror, reference: string): Renderable<Shown> => {
  const found = playlistNamed(mirror, reference)
  if (found.kind === 'none') return failed('show', 'playlist_not_tracked', notTracked(reference))

  // Refused rather than resolved. `show` only reads, so guessing here would cost
  // nothing but a wrong answer -- and a wrong answer to "which of these two did
  // you mean" is the one thing a reader has no way to notice.
  if (found.kind === 'many') {
    return failed('show', 'playlist_ambiguous', ambiguous(reference, found.playlists))
  }

  const { playlist } = found
  const held = mirroredTracks(mirror, playlist.id)

  return succeeded('show', { playlist, ...held }, (width) => human(playlist, held, width))
}

const human = (playlist: MirroredPlaylist, held: MirroredTracks, width: number): string => {
  const note = statusNote(playlist.status)

  return [
    named(playlist.title, playlist.id),
    holds(playlist, held),
    ...(note === null ? [] : [note]),
    ...listing(held, width),
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

/** What each column holds, for the reader of a table that can lose one. */
const HEADINGS = ['#', 'TITLE', 'ARTIST', 'ALBUM', 'TIME', '']

/** Where a Removed Track's marker goes, which is where its number would be. */
const REMOVED_MARK = '-'

/**
 * What each column gives up when the terminal is too narrow, in the order it
 * gives it.
 *
 * The date a Track left goes first: the heading above those rows has already
 * said they are gone, so the column adds a precise answer to a question the
 * reader was not asking. The album goes next, and goes whole rather than
 * shrinking -- `Ninet…` costs nearly the width of the real thing and tells
 * nobody anything. Then the artists shrink, and only then the title.
 *
 * The title being last is the whole point of there being an order. This file
 * used to refuse a width outright, on the grounds that a title cut off is a
 * title a reader cannot search for, and that argument is kept rather than
 * discarded -- two entire columns and part of a third are spent before a single
 * character of a title is.
 */
const MOVES: Move[] = [{ drop: 5 }, { drop: 3 }, { trim: 2, least: 8 }, { trim: 1, least: 12 }]

/**
 * The two blocks, laid out as one set of columns and then cut apart.
 *
 * Cut afterwards rather than laid out separately, so that the Removed rows line
 * up with the present ones instead of each block being square on its own. That
 * alignment is what lets a reader run an eye down the titles across the gap, and
 * it is why the header is in the same layout rather than printed on its own: a
 * header sized apart from its table is a header that does not sit over it.
 *
 * The numbers count what is shown, one upward, rather than carrying the Source's
 * own `position`. That column is preserved with holes in it -- a Skipped entry
 * takes an index, and a Removed Track keeps the one it held when it left -- so
 * printing it would have a reader working out what became of the numbers that
 * are missing, and the answer is on a different part of the screen.
 *
 * A Removed Track's `-` sits in that same column. It used to have one of its
 * own, which cost every present row a blank cell and pushed the entire table six
 * spaces right to make room for a marker almost no row carries.
 *
 * A width is read now, where this file used to refuse to read one. What it
 * refused was cutting a title, and it still does: see `MOVES` for the order that
 * makes a width safe to obey.
 *
 * One caveat, inherited from `columns` and not fixed here: width is
 * `String.length`, UTF-16 code units rather than the columns a terminal spends.
 * A CJK title costs two per unit, so it is cut short of where it should be and
 * still overruns. That was already true of the alignment; it is now visible in
 * the cut as well. Getting it right needs an East-Asian width table.
 */
const listing = ({ tracks, removed }: MirroredTracks, width: number): string[] => {
  if (tracks.length === 0 && removed.length === 0) return []

  const laid = fitted(
    [
      HEADINGS,
      ...tracks.map((track, at) => row(track, String(at + 1))),
      ...removed.map((track) => row(track, REMOVED_MARK)),
    ],
    width,
    MOVES,
  )

  const head = laid[0]!

  return [
    ...(tracks.length === 0 ? [] : ['', head, ...laid.slice(1, tracks.length + 1)]),
    ...(removed.length === 0
      ? []
      : [
          '',
          REMOVED_HEADING,
          // The header goes wherever the first block is. A `show` holding
          // nothing but Removed Tracks would otherwise name its columns above a
          // heading that belongs to them.
          ...(tracks.length === 0 ? [head] : []),
          ...laid.slice(tracks.length + 1),
        ]),
  ]
}

/**
 * One Track, under a mark that is either its number or `sync`'s `-`: a leading
 * `-` is already what this CLI writes beside a Track that left a Playlist.
 */
const row = (track: MirroredTrack, mark: string): string[] => [
  mark,
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
      description: 'Its name, as `jukebox list` prints it, or its id or address',
    },
  },
  run: ({ args }) => showPlaylist(args.playlist!),
})
