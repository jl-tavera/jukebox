import { defineCommand } from 'citty'
import { withMirror, type Mirror } from '../mirror'
import { failed, succeeded, type Renderable } from '../outcome'
import { ambiguous, askingToStop, counted, named, notTracked } from '../phrasing'
import { playlistNamed, type MirroredPlaylist } from '../reading'
import { askOf, type Ask } from '../session'
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
 * **A handle deletes on the spot. A name is asked about first.** This file used
 * to say there was no prompt at all, and gave two reasons: what it deletes can
 * be asked for again, since `CONTEXT.md` calls the Mirror authoritative for
 * local state only and the output prints the `add` that rebuilds it; and a
 * prompt would be a second thing writing to the terminal.
 *
 * Both survive for an id or a URL, which is why neither of those asks anything
 * and nothing about running this from a script has changed. Neither survives a
 * title, which is a handle here now. A title is loose by construction --
 * folded for case, stripped of the quotes the screen prints -- so it is the one
 * reference a person can get subtly wrong and still hit something. And the thing
 * that "can be asked for again" is not all of it: `add` rebuilds the membership
 * a Source will serve, and nothing rebuilds the Removed rows, which `show` calls
 * the whole of what this machine remembers about what the Playlist used to hold.
 *
 * Where nobody can be asked -- a pipe, a redirect, a cron entry -- a title is
 * refused rather than obeyed. `mode.ts` sets that rule for every prompt in the
 * program: a missing answer is an error and never a wait. The way through is the
 * id, which never prompts and which `--json` puts on every row.
 *
 * The menu asks its own question before it launches this, and does not ask
 * twice: it passes the id it picked from, so the branch below is not reached.
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

/**
 * What `remove` has to say, in one object rendered two ways.
 *
 * `stopped` is what the Playlist's row alone cannot say. A person asked whether
 * to stop tracking something can answer no, and the row describing what was
 * nearly deleted looks exactly the same either way -- so without this, the one
 * outcome where nothing happened would be reported as the one where everything
 * did.
 *
 * Only ever `false` for a human, because only a human can be asked: a caller in
 * JSON mode reaches no prompt, and a title it could have been asked about is
 * refused before anything is deleted.
 *
 * ADR-0005 says the bar for adding a field rises as 1.0 approaches, because a
 * field added casually during 0.x is inherited rather than reconsidered. This
 * one clears it by being the alternative to a worse inheritance: without it the
 * outcome where nothing was deleted is reported in the same bytes as the one
 * where everything was, and a caller cannot tell them apart at any version.
 */
export type Untracked = MirroredPlaylist & { note: string; stopped: boolean }

export const removePlaylist = async (
  reference: string,
  data: unknown,
): Promise<Renderable<Untracked>> => {
  return await withMirror((mirror) => stopping(mirror, reference, askOf(data)))
}

const stopping = async (
  mirror: Mirror,
  reference: string,
  ask: Ask | null,
): Promise<Renderable<Untracked>> => {
  const found = playlistNamed(mirror, reference)
  if (found.kind === 'none') return failed('remove', 'playlist_not_tracked', notTracked(reference))

  // Refused, never resolved. `reading.ts` explains why the query stopped taking
  // the first row it found: under a title, "whichever one the planner reached
  // first" is a Playlist deleted by coin toss.
  if (found.kind === 'many') {
    return failed('remove', 'playlist_ambiguous', ambiguous(reference, found.playlists))
  }

  const { playlist } = found

  // Compared against what was typed rather than tracked through the lookup,
  // because that is exactly the question: was this Playlist named by something
  // that identifies precisely one row, or by prose?
  if (playlist.id !== reference && playlist.url !== reference) {
    if (ask === null) return failed('remove', 'invalid_usage', nobodyToAsk(playlist))
    if (!(await ask.confirm(askingToStop(playlist)))) return leftAlone(playlist)
  }

  // Reported out of the row that found it, which was read a statement ago and is
  // still true. Counting afterwards would count what the cascade left, which is
  // nothing, and counting twice would be two answers to one question.
  stopTracking(mirror, playlist.id)

  return succeeded('remove', { ...playlist, note: LOCAL_ONLY, stopped: true }, () =>
    human(playlist),
  )
}

/**
 * The Playlist was named, the question was asked, and the answer was no.
 *
 * A success rather than a failure, and the exit code says zero. Nothing went
 * wrong: a person was asked what they wanted and got it. A non-zero code here
 * would tell a caller that something needed looking at, and the thing that
 * happened is the thing that was chosen.
 */
const leftAlone = (playlist: MirroredPlaylist): Renderable<Untracked> =>
  succeeded(
    'remove',
    { ...playlist, note: LOCAL_ONLY, stopped: false },
    () => `Left ${named(playlist.title, playlist.id)} alone. Nothing was deleted.`,
  )

/**
 * A title, and nobody to ask about it.
 *
 * `invalid_usage` because that is what it is: the vector named a real Playlist,
 * but by a kind of reference this command will not act on unattended. The same
 * vector with an id works, which is what the second line says -- and a caller
 * reading JSON already has that id, because it is on every row of `list`.
 */
const nobodyToAsk = (playlist: MirroredPlaylist): string =>
  [
    `Refusing to remove ${named(playlist.title, playlist.id)} by name with nobody to confirm it.`,
    'A name is matched loosely, so this asks first -- and there is no terminal here to ask.',
    `Run \`jukebox remove ${playlist.id}\` instead. An id names one playlist and never asks.`,
  ].join('\n')

const human = (playlist: MirroredPlaylist): string =>
  [
    `Stopped tracking ${named(playlist.title, playlist.id)}.`,
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
      description: 'Its name, as `jukebox list` prints it, or its id or address',
    },
  },
  run: ({ args, data }) => removePlaylist(args.playlist!, data),
})
