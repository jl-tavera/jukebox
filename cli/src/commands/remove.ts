import { defineCommand } from 'citty'
import { MirrorUnopenable, withMirror, type Mirror } from '../mirror'
import { failed, succeeded, type Renderable } from '../outcome'
import { counted, identified, notTracked } from '../phrasing'
import { playlistNamed, type MirroredPlaylist } from '../reading'
import { stopTracking } from '../tracking'

/**
 * `jukebox remove <playlist>`: stop tracking a Playlist here, and delete what
 * this machine recorded for it.
 *
 * Local by necessity rather than by choice. The worker has no notion of who
 * tracks what and no endpoint that could be told, so there is nothing to send
 * and nowhere to send it. That is easy to assume the opposite of -- a command
 * called `remove`, run against a Playlist, reads as though something upstream
 * changed -- so the help says so before anyone runs it and the output says so
 * after.
 *
 * There is no confirmation prompt, and it is not an omission. What this deletes
 * can be asked for again: `CONTEXT.md` calls the Mirror authoritative for local
 * state only, rebuildable from a server snapshot, and the output prints the
 * `add` that rebuilds it. A prompt would also have to be a second thing that
 * writes to the terminal, which `render.ts` is deliberately the only one of.
 */

/**
 * The sentence, exported so that a test pins the sentence rather than a
 * paraphrase of it -- `config`'s note is kept honest the same way. Carried in
 * the result as well as printed, because a caller reading JSON is at least as
 * likely to be the one who assumed this reached the server.
 */
export const LOCAL_ONLY =
  'This affects this machine only. The playlist itself has not changed, its source has not\n' +
  'been touched, and anyone else tracking it is unaffected.'

/** What `remove` has to say, in one object rendered two ways. */
export type Untracked = MirroredPlaylist & { note: string }

export const removePlaylist = async (reference: string): Promise<Renderable<Untracked>> => {
  try {
    return await withMirror((mirror) => stopping(mirror, reference))
  } catch (error) {
    if (error instanceof MirrorUnopenable) {
      return failed('remove', 'mirror_unopenable', error.message)
    }
    throw error
  }
}

const stopping = (mirror: Mirror, reference: string): Renderable<Untracked> => {
  const playlist = playlistNamed(mirror, reference)
  if (playlist === null) return failed('remove', 'playlist_not_tracked', notTracked(reference))

  // Reported out of the row that found it, which was read a statement ago and is
  // still true. Counting afterwards would count what the cascade left, which is
  // nothing, and counting twice would be two answers to one question.
  stopTracking(mirror, playlist.id)

  return succeeded('remove', { ...playlist, note: LOCAL_ONLY }, () => human(playlist))
}

const human = (playlist: MirroredPlaylist): string =>
  [
    `Stopped tracking ${identified(playlist.title, playlist.id)}.`,
    deleted(playlist),
    '',
    LOCAL_ONLY,
    `Run \`jukebox add ${playlist.url}\` to track it again.`,
  ].join('\n')

/**
 * What went.
 *
 * A Track the Source had stopped listing is still a row, and it goes too -- so
 * it is counted, separately, rather than folded into a total that would then
 * disagree with the one `list` was printing a moment ago.
 *
 * Two words in `CONTEXT.md` are avoided here on purpose, and they pull in
 * opposite directions. **Removed** belongs to a Track its Source no longer
 * lists, so it cannot describe what this command did without putting two
 * meanings in one sentence -- hence "left the playlist" for those rows. And
 * **Gone** is a Playlist status, so it cannot describe the rows either. What is
 * left is "deleted", which the glossary lists under _Avoid_ only as a synonym
 * for those two: here the rows genuinely are deleted, and this is the one
 * command in the CLI that deletes anything.
 */
const deleted = ({ tracks, removed }: MirroredPlaylist): string => {
  if (tracks === 0 && removed === 0) return 'It had no tracks recorded.'

  const counts = [
    counted(tracks, 'track', 'tracks'),
    ...(removed === 0 ? [] : [`${removed} that had already left the playlist`]),
  ].join(', and ')

  return `Its local record is deleted: ${counts}.`
}

export const remove = defineCommand({
  meta: {
    name: 'remove',
    // The local-only fact is in the one line `--help` prints for this command,
    // not only in the paragraph it prints after the command has run.
    description: 'Stop tracking a playlist on this machine and delete its local record',
  },
  args: {
    playlist: {
      type: 'positional',
      description: 'Its id, as `jukebox list` prints it, or the address you added it with',
    },
  },
  run: ({ args }) => removePlaylist(args.playlist!),
})
