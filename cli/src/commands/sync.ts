import { defineCommand } from 'citty'
import type { ErrorCode, PlaylistId } from '@jukebox/schema'
import { playlistTracks } from '../api'
import { withMirror, type Mirror } from '../mirror'
import { succeeded, type Renderable } from '../outcome'
import { counted, named, NOTHING_TRACKED } from '../phrasing'
import { backend } from '../session'
import {
  applySnapshot,
  recordRefusal,
  trackedPlaylists,
  type NamedTrack,
  type TrackedPlaylist,
} from '../tracking'

/**
 * `jukebox sync`: ask about every tracked Playlist, and say what actually
 * changed.
 *
 * The design target is that the overwhelmingly common Sync does nothing and
 * costs nothing. Each Playlist is asked about with the Version last seen, and an
 * unchanged one is answered without a body at all -- no snapshot to parse, and
 * not one statement of SQL. That conditional request is the invariant this
 * command exists to keep, which is why it is tested against a real HTTP server
 * rather than a stand-in that decides for itself what one means.
 *
 * What it reports is names, not counts. A Track that leaves is Removed rather
 * than deleted -- its row stays and gains the moment it left -- and that is the
 * only reason this command can say a change happened instead of printing one
 * number and then another for the reader to compare.
 */

/** A Playlist and the answer the API gave about it. */
type About<T> = { id: PlaylistId; title: string | null } & T

/**
 * What became of one Playlist, in the five answers spec #29 names.
 *
 * All five are correct answers to a Sync that worked, so none of them is a
 * failure and none of them makes the command exit non-zero. `unreachable` is the
 * sixth case and the one that is not an answer at all: no reply, or a reply
 * nothing here can read. It is a Playlist's own outcome rather than the end of
 * the run, because one Playlist the CLI could not ask about must not stop it
 * asking about the rest.
 */
export type Reported =
  | About<{ answer: 'unchanged' }>
  | About<{ answer: 'changed'; version: number; added: NamedTrack[]; removed: NamedTrack[] }>
  | About<{ answer: 'resolving' }>
  | About<{ answer: 'refused'; code: ErrorCode; message: string }>
  | About<{ answer: 'unreachable'; message: string }>

/** What `sync` has to say, in one object rendered two ways. */
export type Synced = { playlists: Reported[] }

export const syncPlaylists = async (data: unknown): Promise<Renderable<Synced>> => {
  // The boot first and the Mirror after it, for the reason `add` does the same:
  // a hard stop that has already created and migrated a database is not one.
  const { api } = await backend(data)

  return await withMirror((mirror) => asking(mirror, api))
}

/**
 * Every tracked Playlist, one after another.
 *
 * Sequential rather than at once, and it costs nothing worth having: almost every
 * ask is answered `304` off a single cache read. What it buys is a report in a
 * fixed order and one Playlist's writes never interleaving with another's.
 *
 * Nothing here catches anything, because by the time a Playlist gets back here
 * everything the API could do to it is already an answer rather than a throw --
 * `api.ts` decides that, for every command rather than for this one. What is
 * still allowed through is a Mirror that will not write, which is not an answer
 * about one Playlist and not something this command should dress up as one;
 * `main`'s catch-all has it, as everywhere else.
 */
const asking = async (mirror: Mirror, api: string): Promise<Renderable<Synced>> => {
  const playlists: Reported[] = []

  for (const playlist of trackedPlaylists(mirror)) {
    playlists.push(await askedAbout(mirror, api, playlist))
  }

  return report(playlists)
}

const askedAbout = async (
  mirror: Mirror,
  api: string,
  playlist: TrackedPlaylist,
): Promise<Reported> => {
  const { id, title } = playlist

  // The Version last seen goes with the ask, which is the whole of the
  // conditional request. A Playlist that has never resolved holds none and is
  // asked outright.
  const held = await playlistTracks(api, id, playlist.lastVersion)

  if (held.kind === 'unchanged') return { id, title, answer: 'unchanged' }

  if (held.kind === 'snapshot') {
    const { snapshot } = held
    const { added, removed } = applySnapshot(mirror, id, snapshot, Date.now())

    // The snapshot's title rather than the stored one: this is the Playlist as it
    // is now, and a rename is one of the things that moves a Version.
    return {
      id,
      title: snapshot.title,
      answer: 'changed',
      version: snapshot.version,
      added,
      removed,
    }
  }

  if (held.kind === 'resolving') return { id, title, answer: 'resolving' }

  if (held.kind === 'refused') {
    // Which of the four codes mean something locally is `tracking.ts`'s to know,
    // not this command's -- `add` asks it the same question. Nothing else moves
    // either way: neither status has Tracks, so whatever the Playlist already
    // had it keeps.
    recordRefusal(mirror, id, held.code)

    return { id, title, answer: 'refused', code: held.code, message: held.message }
  }

  return { id, title, answer: 'unreachable', message: held.message }
}

/**
 * A Mirror with nothing in it is a Sync that worked and had nothing to do, and
 * `list` reading the same Mirror has the same nothing to report. The sentence
 * moved to `phrasing.ts` at #37 so that both say it in the same words.
 */
const report = (playlists: Reported[]): Renderable<Synced> =>
  succeeded('sync', { playlists }, () =>
    playlists.length === 0 ? NOTHING_TRACKED : playlists.map(line).join('\n'),
  )

/**
 * One Playlist, as a person reads it.
 *
 * `nothing changed` and `no tracks added or removed` are deliberately different
 * sentences. The first is the `304` -- the server never sent a body. The second
 * is a Version that moved for something other than membership, a rename most
 * likely. Collapsing them would hide the one thing worth knowing about a Sync:
 * whether it cost anything.
 *
 * Both failure cases print the sentence the server wrote, verbatim and unlabelled.
 * That is what the contract's error envelope is for, and it is why that copy can
 * improve without a client release.
 */
const line = (reported: Reported): string => {
  const who = named(reported.title, reported.id)

  if (reported.answer === 'unchanged') return `${who}: nothing changed.`
  if (reported.answer === 'resolving') return `${who}: still being read from its source.`
  if (reported.answer !== 'changed') return `${who}: ${reported.message}`

  const { added, removed } = reported
  if (added.length === 0 && removed.length === 0) return `${who}: no tracks added or removed.`

  return [
    `${who}: ${movement(added.length, removed.length)}.`,
    ...added.map((track) => `  + ${track.title}`),
    ...removed.map((track) => `  - ${track.title}`),
  ].join('\n')
}

/** Only what moved is mentioned, so `0 tracks removed` never has to be read past. */
const movement = (added: number, removed: number): string =>
  [
    ...(added > 0 ? [`${counted(added, 'track', 'tracks')} added`] : []),
    ...(removed > 0 ? [`${counted(removed, 'track', 'tracks')} removed`] : []),
  ].join(', ')

export const sync = defineCommand({
  meta: {
    name: 'sync',
    description: 'Ask about every playlist you track and report what changed',
  },
  run: ({ data }) => syncPlaylists(data),
})
