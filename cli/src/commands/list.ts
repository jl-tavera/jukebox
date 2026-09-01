import { defineCommand } from 'citty'
import { MirrorUnopenable, withMirror } from '../mirror'
import { failed, succeeded, type Renderable } from '../outcome'
import { columns, held, identified, NOTHING_TRACKED, stamp } from '../phrasing'
import { mirroredPlaylists, type MirroredPlaylist } from '../reading'

/**
 * `jukebox list`: every Playlist this machine tracks, at a glance.
 *
 * It reads the Mirror and nothing else. There is no `backend(data)` call in this
 * file and that is the whole of "works with no network" -- `boot.ts` holds the
 * only door to the network, and a command that never asks the session for one
 * cannot fetch, cannot fall back to a saved document, and cannot fail because a
 * site is down. `config` keeps the same property the same way.
 *
 * Two counts rather than one, because a Track that leaves is Removed rather than
 * deleted. Its row stays, so the Mirror's total is not the Playlist's length,
 * and printing one number would make `show` look like it had invented rows.
 */

/** What `list` has to say, in one object rendered two ways. */
export type Listed = { playlists: MirroredPlaylist[] }

export const listPlaylists = async (): Promise<Renderable<Listed>> => {
  try {
    return await withMirror((mirror) => report(mirroredPlaylists(mirror)))
  } catch (error) {
    if (error instanceof MirrorUnopenable) {
      return failed('list', 'mirror_unopenable', error.message)
    }
    throw error
  }
}

const report = (playlists: MirroredPlaylist[]): Renderable<Listed> =>
  succeeded('list', { playlists }, () =>
    playlists.length === 0 ? NOTHING_TRACKED : columns(playlists.map(row)).join('\n'),
  )

/**
 * One Playlist, as four aligned cells.
 *
 * The id is printed beside the title rather than only standing in for a missing
 * one, and it is the widest thing on the line. It has to be: this is the screen
 * `show` and `remove` both point a reader at -- their argument is documented as
 * "its id, as `jukebox list` prints it" -- and a title alone is not something
 * either of them accepts. Printing only the title would make that instruction
 * false for every Playlist that has one, and leave `--json` as the only way to
 * find the string the next command wants.
 *
 * The status is printed as the word the Mirror stores and the JSON carries,
 * rather than translated into something prettier. That is `config`'s rule for
 * its keys and it holds for the same reason: what a reader sees should be what
 * they would have to match on if they went looking.
 */
const row = (playlist: MirroredPlaylist): string[] => [
  identified(playlist.title, playlist.id),
  playlist.status,
  held(playlist),
  when(playlist.lastSyncedAt),
]

/**
 * When this machine's copy of it last moved, to the minute, or that it never
 * has.
 *
 * "updated" rather than "synced", and the column it reads is `last_synced_at`,
 * so the difference is worth spelling out. `recordResolved` writes that column,
 * and it only runs when a snapshot arrives. A Sync answered `304` -- which is
 * the answer this tool is designed to receive most often -- writes nothing at
 * all, deliberately. So a Playlist synced nightly and unchanged since May holds
 * May's timestamp, and printing that under the word "synced" would tell its
 * owner their nightly run had stopped working. What the number honestly says is
 * when the local record last changed.
 *
 * Said in both cases, because a blank cell is a question rather than an answer:
 * a Playlist still being read from its Source has genuinely never been updated,
 * and that is worth reading rather than inferring from an empty column.
 */
const when = (at: number | null): string =>
  at === null ? 'never updated' : `updated ${stamp(at)}`

export const list = defineCommand({
  meta: {
    name: 'list',
    description: 'Show every playlist you track, with its status and what it holds',
  },
  run: listPlaylists,
})
