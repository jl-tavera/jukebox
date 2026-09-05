import { defineCommand } from 'citty'
import { withMirror } from '../mirror'
import { succeeded, type Renderable } from '../outcome'
import { columns } from '../fitting'
import { held, labels, NOTHING_TRACKED, stamp } from '../phrasing'
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
  return await withMirror((mirror) => report(mirroredPlaylists(mirror)))
}

const report = (playlists: MirroredPlaylist[]): Renderable<Listed> =>
  succeeded('list', { playlists }, () => {
    if (playlists.length === 0) return NOTHING_TRACKED

    const called = labels(playlists)
    return columns(playlists.map((playlist) => row(playlist, called.get(playlist.id)!))).join('\n')
  })

/**
 * One Playlist, as four aligned cells.
 *
 * The name leads and the id is usually not here at all. It used to be printed
 * beside every title, because `show` and `remove` took nothing else and their
 * argument was documented as "its id, as `jukebox list` prints it". They take
 * the name now, so the string a reader needs for the next command is the one
 * already in front of them -- and thirty characters that identified nothing a
 * reader could not already see are gone from every row.
 *
 * What decides that is `labels`, over the whole set rather than this row, for
 * the reason it explains: whether a name identifies a Playlist is a fact about
 * the Playlists beside it. A `--json` caller is unaffected either way, and has
 * carried the id on every row since #37.
 *
 * The status is printed as the word the Mirror stores and the JSON carries,
 * rather than translated into something prettier. That is `config`'s rule for
 * its keys and it holds for the same reason: what a reader sees should be what
 * they would have to match on if they went looking.
 */
const row = (playlist: MirroredPlaylist, called: string): string[] => [
  called,
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
