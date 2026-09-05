import { readdirSync } from 'node:fs'
import { defineCommand } from 'citty'
import { withMirror, type Mirror } from '../mirror'
import { configuration } from '../config'
import { fileNamed, folderOf } from '../opening'
import { failed, succeeded, type Renderable } from '../outcome'
import { joiner, thisHost } from '../paths'
import { ambiguous, billed, counted, named, notTracked, NOTHING_FETCHED } from '../phrasing'
import {
  mirroredTracks,
  playlistNamed,
  type MirroredPlaylist,
  type MirroredTrack,
} from '../reading'
import { openerOf } from '../session'

/**
 * `jukebox open <playlist> <track>`: one Track's audio, handed to whatever the
 * machine opens audio with.
 *
 * The one command in this CLI that reaches outside the process, and the reason
 * it exists is ADR-0007. #108 wanted a Track picker in the menu, and that
 * document is explicit about the order such a thing arrives in -- "anything
 * wanted in the menu is a command first", and by name, "somebody arriving
 * expecting a file browser or an audio player finds neither, and the answer is a
 * command followed by a menu entry that launches it". So this is not a flag form
 * bolted on for completeness; it is the feature, and the picker launches it.
 *
 * It reads local state and the filesystem, and touches no network. There is no
 * `backend(data)` here, which is what keeps it working during an outage --
 * `list`, `show` and `config` make the same promise and #50 lists it as a user
 * story.
 *
 * **It will usually say the file is not there.** Nothing in this release
 * downloads anything, so unless somebody has put audio in the Playlist's folder
 * themselves there is none to open. That is the ordinary answer rather than a
 * broken one, and the sentence it gives says so instead of leaving a reader to
 * conclude a download failed.
 */

/**
 * What `open` has to say.
 *
 * The Playlist and the Track are nested whole, for `Shown`'s reason: a caller
 * handles a row from `list` or `show` and one from here with the same code.
 */
export type Opened = {
  playlist: MirroredPlaylist
  track: MirroredTrack
  /** The number it was reached by, which is `show`'s `#`. */
  at: number
  /** The file handed to the operating system. Absolute. */
  path: string
}

/**
 * A number, or nothing.
 *
 * `/^[1-9][0-9]*$/` rather than `Number.isInteger`, and the difference is not
 * pedantry: `Number('1e1')` is 10, and a whole number that nobody typed is worse
 * than a rejected one. Leading zeroes go the same way -- `show` prints `2` and
 * this takes what `show` prints.
 */
const numbered = (raw: string): number | null => (/^[1-9][0-9]*$/.test(raw) ? Number(raw) : null)

/** The Playlist and the Track a reference and a number name, or why they name none. */
type Reached =
  | { found: true; playlist: MirroredPlaylist; track: MirroredTrack; at: number }
  | { found: false; answer: Renderable<never> }

const reach = (mirror: Mirror, reference: string, raw: string): Reached => {
  const refuse = (answer: Renderable<never>): Reached => ({ found: false, answer })

  const found = playlistNamed(mirror, reference)
  if (found.kind === 'none') {
    return refuse(failed('open', 'playlist_not_tracked', notTracked(reference)))
  }

  // Refused rather than resolved, exactly as `show` refuses it and for the same
  // reason. This command is a step further from harmless than `show` is -- it
  // starts a program -- so if anything the argument is stronger here.
  if (found.kind === 'many') {
    return refuse(failed('open', 'playlist_ambiguous', ambiguous(reference, found.playlists)))
  }

  const at = numbered(raw)
  if (at === null) {
    return refuse(
      failed(
        'open',
        'invalid_usage',
        `\`${raw}\` is not a track number. Use the number in the \`#\` column of \`jukebox show\`.`,
      ),
    )
  }

  const { playlist } = found

  // `.tracks` and never `.removed`. `reading.ts` has already split them, so this
  // filters nothing of its own and therefore cannot disagree with `show` about
  // what is numbered -- which is the whole reason the menu is allowed to send a
  // number straight here without recomputing it.
  //
  // It filters nothing on a *file*, either. A Track whose audio is absent has a
  // number like any other and reaches the search below, where it fails with a
  // sentence about the file rather than one about the number. Those are
  // different facts and a person is owed the right one.
  const { tracks } = mirroredTracks(mirror, playlist.id)
  const track = tracks[at - 1]

  if (track === undefined) {
    return refuse(
      failed(
        'open',
        'track_not_recorded',
        tracks.length === 0
          ? `${named(playlist.title, playlist.id)} has no tracks recorded for it.`
          : `${named(playlist.title, playlist.id)} holds ${counted(tracks.length, 'track', 'tracks')}, so there is no track ${at}.`,
      ),
    )
  }

  return { found: true, playlist, track, at }
}

/**
 * Where the audio is, or `null` with the folder that was searched for it.
 *
 * The one impure step, and it is one call. Everything that decides which name
 * matches is in `opening.ts` and takes the names as an argument, so the only
 * thing that can go wrong here is the read itself.
 *
 * A folder that is not there reads exactly like a folder with nothing in it, and
 * that is right rather than lazy: in a release that creates no folders, "you
 * have not downloaded this" is the true answer to both, and `ENOENT` is not a
 * fact a person needs. `unexpected` would be wrong for the same reason -- it
 * says of itself that it is always a bug here, and a Library nobody has made yet
 * is not one.
 */
const audioFor = (folder: string | null, title: string): string | null => {
  if (folder === null) return null

  try {
    return fileNamed(title, readdirSync(folder))
  } catch {
    return null
  }
}

export const openTrack = async (
  reference: string,
  raw: string,
  data: unknown,
): Promise<Renderable<Opened>> => {
  const reached = await withMirror((mirror) => reach(mirror, reference, raw))
  if (!reached.found) return reached.answer

  const { playlist, track, at } = reached

  const host = thisHost()
  const folder = folderOf(host, configuration(host).settings.library_path.value, playlist.folderName)
  const name = audioFor(folder, track.title)

  if (folder === null || name === null) {
    return failed(
      'open',
      'track_file_missing',
      [
        `No audio for ${billed(track)} in ${named(playlist.title, playlist.id)}.`,
        folder === null
          ? 'This playlist has no folder yet, because it has never resolved.'
          : `Jukebox looked in ${folder}.`,
        NOTHING_FETCHED,
      ].join('\n'),
    )
  }

  const path = joiner(host)(folder, name)

  // Last, and after everything that could refuse. Nothing is started for a run
  // that was going to report a failure, which is the ordering a person notices
  // only when it is wrong -- a player opening a moment before the terminal says
  // the file was missing.
  try {
    openerOf(data)(host, path)
  } catch {
    return failed(
      'open',
      'file_unopenable',
      [
        `Jukebox could not ask this machine to open ${path}.`,
        'On Linux that usually means `xdg-open` is not installed.',
      ].join('\n'),
    )
  }

  return succeeded('open', { playlist, track, at, path }, () =>
    [`Opening ${billed(track)}.`, path].join('\n'),
  )
}

export const open = defineCommand({
  meta: {
    name: 'open',
    description: "Open one track's file with whatever plays it on this machine",
  },
  args: {
    playlist: {
      type: 'positional',
      description: 'Its name, as `jukebox list` prints it, or its id or address',
    },
    // Keyed `track` because citty renders a positional as its key uppercased,
    // and `generate-help.ts` asserts the two agree before it will write the
    // landing page.
    track: {
      type: 'positional',
      description: 'Its number, as `jukebox show` prints it in the `#` column',
    },
  },
  run: ({ args, data }) => openTrack(args.playlist!, args.track!, data),
})
