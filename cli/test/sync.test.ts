import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import type { Synced } from '../src/commands/sync'
import { MIRROR_FILE } from '../src/mirror'
import { jukebox, mirrorOf, oneObject, removeHomes, temporaryHome, type Run } from './harness'
import {
  breaking,
  REFUSALS,
  servingItsOwnApi,
  snapshot,
  stopServing,
  track,
  type Site,
} from './server'

/**
 * Seam 3: the CLI's command entry point, driven with an argument vector against
 * a home of this run's own and a real HTTP server on a port the operating system
 * chose.
 *
 * A real server rather than a replaced `fetch`, and for this command that is the
 * whole point rather than a convention inherited from `add`. The invariant worth
 * protecting is the conditional request -- almost every Sync is a `304` costing
 * nothing -- and a fake that decided for itself what `If-None-Match` meant would
 * agree just as happily with a CLI that never sent one. So the server applies the
 * worker's own rule, and `unchanged` in a result object is only ever reachable by
 * a run that really did send the Version it was holding.
 *
 * Every test starts by running `add`, which is the honest way to reach a Mirror
 * with something in it and is spec #29's whole `add` -> poll -> `sync` path.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

/** A second Playlist. `1Ab...` sorts before `3cE...`, so this one is asked about first. */
const OTHER = 'https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU'
const OTHER_ID = 'spotify:1AbCdEfGhIjKlMnOpQrStU'

/** Short enough for a test suite to watch `add`'s wait run out. */
const BRIEF = { windowMs: 100, intervalMs: 10 }

/** Two Tracks and one entry the Source offered that never became one. */
const twoTracks = snapshot({
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track(),
    track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 1 }),
  ],
})

/** One `add` against a home of this test's own, which is where every Sync starts. */
const tracking = (site: Site, name: string, url: string = URL): Promise<Run> =>
  jukebox(['add', url, '--json'], {
    discovery: site.url,
    patience: BRIEF,
    home: temporaryHome(name),
  })

/** One more `add` into a home that already exists. */
const alsoTracking = (site: Site, home: string, url: string): Promise<Run> =>
  jukebox(['add', url, '--json'], { discovery: site.url, patience: BRIEF, home })

/** One `sync` over whatever that home now holds. */
const syncing = (site: Site, home: string, json = true): Promise<Run> =>
  jukebox(json ? ['sync', '--json'] : ['sync'], { discovery: site.url, home })

const synced = (run: Run): Synced => oneObject(run).data as Synced

/** Every Track row, so a test can say a Sync left them exactly as they were. */
const trackRows = (run: Run) =>
  mirrorOf(run, (mirror) =>
    mirror
      .query<
        {
          track_id: string
          title: string
          position: number
          added_at: number
          removed_at: number | null
        },
        []
      >('SELECT track_id, title, position, added_at, removed_at FROM tracks ORDER BY track_id')
      .all(),
  )

/** The Playlist row, which is where "changed nothing locally" is either true or not. */
const playlistRow = (run: Run) =>
  mirrorOf(run, (mirror) =>
    mirror
      .query<
        {
          title: string | null
          status: string
          last_version: number | null
          skipped: number | null
          last_synced_at: number | null
          folder_name: string | null
        },
        []
      >(
        'SELECT title, status, last_version, skipped, last_synced_at, folder_name FROM playlists',
      )
      .get(),
  )

describe('a Playlist nothing has changed', () => {
  it('is answered without a body, and changes nothing at all', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-unchanged-')
    const tracks = trackRows(added)
    const playlist = playlistRow(added)

    const run = await syncing(site, added.home)

    // `unchanged` is reachable only through a 304, and the server only answers
    // one to a caller that sent the Version it was holding. A run that sent no
    // conditional header would be served the whole snapshot and would land on
    // `changed` -- which is what makes this an assertion about the conditional
    // request rather than about a diff that happened to come out empty.
    expect(synced(run).playlists).toEqual([{ id: ID, title: 'Rain / Shine', answer: 'unchanged' }])
    expect(run.code).toBe(0)

    // Nothing locally, and that means nothing: not the Tracks, and not
    // `last_synced_at` either. The cheap path reads one cache key upstream and
    // writes no SQL here.
    expect(trackRows(added)).toEqual(tracks)
    expect(playlistRow(added)).toEqual(playlist)
  })

  it('says so for a person, in one line', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-unchanged-human-')
    const run = await syncing(site, added.home, false)

    expect(run.stdout.trim()).toBe('"Rain / Shine": nothing changed.')
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('a Playlist whose Version has moved', () => {
  /** Blue Dot has left, Sun Dogs has joined, and Long Way Down has moved up. */
  const moved = snapshot({
    version: 2,
    title: 'Rain / Shine',
    skipped: 1,
    tracks: [
      track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 0 }),
      track({ sourceTrackId: 'sun-dogs', title: 'Sun Dogs', position: 1 }),
    ],
  })

  it('reports what joined and what left, by name', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-changed-')
    site.holding(ID, moved)

    const run = await syncing(site, added.home)

    expect(synced(run).playlists).toEqual([
      {
        id: ID,
        title: 'Rain / Shine',
        answer: 'changed',
        version: 2,
        added: [{ trackId: 'spotify:sun-dogs', title: 'Sun Dogs' }],
        removed: [{ trackId: 'spotify:blue-dot', title: 'Blue Dot' }],
      },
    ])
    expect(run.code).toBe(0)
  })

  it('marks the departed Removed, keeps its row, and repositions the rest', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-rows-')
    const joined = trackRows(added).find((row) => row.track_id === 'spotify:long-way-down')!
    site.holding(ID, moved)

    await syncing(site, added.home)

    const rows = trackRows(added)

    // A Track that leaves is Removed, not deleted: its row stays and gains the
    // moment it left. Without that there is nothing to report a change from.
    const left = rows.find((row) => row.track_id === 'spotify:blue-dot')!
    expect(left.title).toBe('Blue Dot')
    expect(left.removed_at).not.toBeNull()

    // Moved up, and keeping the moment it first joined -- its row is that
    // Track's whole history in this Playlist.
    const stayed = rows.find((row) => row.track_id === 'spotify:long-way-down')!
    expect(stayed.position).toBe(0)
    expect(stayed.added_at).toBe(joined.added_at)

    expect(rows.find((row) => row.track_id === 'spotify:sun-dogs')!.removed_at).toBeNull()
  })

  it('names them out loud for a person', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-changed-human-')
    site.holding(ID, moved)

    const run = await syncing(site, added.home, false)

    // By name, which is the whole point: a sync that printed one count and then
    // another would leave the reader to do the diffing.
    expect(run.stdout).toContain('1 track added, 1 track removed')
    expect(run.stdout).toContain('+ Sun Dogs')
    expect(run.stdout).toContain('- Blue Dot')
    expect(run.code).toBe(0)
  })
})

describe('a Version that moved without the membership moving', () => {
  /** A rename moves the Version: a Playlist's title is part of what one names. */
  const renamed = snapshot({ ...twoTracks, version: 2, title: 'Rain and Shine' })

  it('is reported apart from an unchanged Playlist, and moves no rows', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-renamed-')
    const tracks = trackRows(added)
    site.holding(ID, renamed)

    const run = await syncing(site, added.home)

    // `changed` rather than `unchanged`, because the server did send a body.
    // Applying the same membership twice is what makes an interrupted Sync safe
    // to rerun, and it must not restamp a single `added_at`.
    expect(synced(run).playlists).toEqual([
      { id: ID, title: 'Rain and Shine', answer: 'changed', version: 2, added: [], removed: [] },
    ])
    expect(trackRows(added)).toEqual(tracks)
    expect(run.code).toBe(0)
  })

  it('keeps the folder it was created with, and takes the new title', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-folder-')
    site.holding(ID, renamed)

    await syncing(site, added.home)

    // ADR-0004: renaming a directory of the user's files in response to a remote
    // change is what the rule against destroying local files exists to prevent.
    expect(playlistRow(added)).toMatchObject({
      title: 'Rain and Shine',
      folder_name: 'Rain Shine',
      last_version: 2,
    })
  })
})

describe('the five answers a Sync can be given', () => {
  const keys = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'] as const
  const addressOf = (key: string) => `https://open.spotify.com/playlist/${key}`

  it('are each reported distinctly, and every one of them exits zero', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-sync-five-')

    // Tracked first, all five alike and all at Version 1. What each is asked is
    // the same question; only the answer differs.
    for (const key of keys) {
      site.tracking(addressOf(key), { id: `spotify:${key}`, status: 'ok' })
      site.holding(`spotify:${key}`, twoTracks)
      await alsoTracking(site, home, addressOf(key))
    }

    site.holding('spotify:bbb', snapshot({ ...twoTracks, version: 2, tracks: [track()] }))
    site.holding('spotify:ccc', 'resolving')
    site.holding('spotify:ddd', REFUSALS.gone)
    site.holding('spotify:eee', REFUSALS.unavailable)

    const run = await syncing(site, home)
    const reported = synced(run).playlists

    // Ordered by id, which is what makes a report of several Playlists read the
    // same way twice running.
    expect(reported.map((playlist) => playlist.id)).toEqual(keys.map((key) => `spotify:${key}`))

    expect(reported.map((playlist) => playlist.answer)).toEqual([
      'unchanged',
      'changed',
      'resolving',
      'refused',
      'refused',
    ])

    // The two refusals share an answer and differ in the thing a script branches
    // on, which is what the contract's error envelope is for.
    expect(reported.slice(3).map((playlist) => 'code' in playlist && playlist.code)).toEqual([
      'playlist_gone',
      'source_unavailable',
    ])

    // Nothing changed, changed, still resolving, gone and temporarily
    // unreachable are all correct answers to a Sync that worked. A tool that
    // exited non-zero on the answer it receives most often could not be
    // scheduled.
    expect(run.code).toBe(0)
  })

  it('prints the sentence the server wrote, for the two that are refusals', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-verbatim-')
    site.holding(ID, REFUSALS.gone)

    const run = await syncing(site, added.home, false)

    // Verbatim, which is what lets that copy improve without a client release.
    expect(run.stdout).toContain(REFUSALS.gone.message)
    expect(run.code).toBe(0)
  })
})

describe('a Playlist its Source will no longer serve', () => {
  it('is marked Gone and keeps every Track it had', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-gone-')
    const tracks = trackRows(added)
    site.holding(ID, REFUSALS.gone)

    await syncing(site, added.home)

    // A remote failure never costs a reader what they already had, which is why
    // `remove` is the only thing that deletes.
    expect(playlistRow(added)).toMatchObject({ status: 'gone', last_version: 1 })
    expect(trackRows(added)).toEqual(tracks)
  })
})

describe('a Playlist the server is not tracking', () => {
  it('is reported in the server own words, and claims nothing about the Playlist', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-notfound-')
    site.holding(ID, REFUSALS.notFound)

    const run = await syncing(site, added.home)

    expect(synced(run).playlists).toEqual([
      {
        id: ID,
        title: 'Rain / Shine',
        answer: 'refused',
        code: 'playlist_not_found',
        message: REFUSALS.notFound.message,
      },
    ])

    // The Mirror has no status for it, and inventing one would record a claim
    // about the Playlist when what happened is that the server has no row.
    expect(playlistRow(added)).toMatchObject({ status: 'ok' })
    expect(run.code).toBe(0)
  })
})

/** Two Playlists tracked in one home, the failing one first in id order. */
const twoTracked = async (site: Site, name: string): Promise<string> => {
  const home = temporaryHome(name)

  for (const [url, id] of [
    [OTHER, OTHER_ID],
    [URL, ID],
  ] as const) {
    site.tracking(url, { id, status: 'ok' })
    site.holding(id, twoTracks)
    await alsoTracking(site, home, url)
  }

  return home
}

describe('one Playlist that cannot be synced', () => {
  it('does not stop the rest of them syncing', async () => {
    const site = servingItsOwnApi()
    const home = await twoTracked(site, 'jukebox-sync-carries-on-')

    site.holding(OTHER_ID, REFUSALS.gone)
    site.holding(ID, snapshot({ ...twoTracks, version: 2, tracks: [track()] }))

    const run = await syncing(site, home)
    const reported = synced(run).playlists

    expect(reported[0]).toMatchObject({ id: OTHER_ID, answer: 'refused' })

    // The one behind it was still asked, and its snapshot still applied.
    expect(reported[1]).toMatchObject({
      id: ID,
      answer: 'changed',
      version: 2,
      removed: [{ trackId: 'spotify:long-way-down', title: 'Long Way Down' }],
    })
    expect(run.code).toBe(0)
  })
})

describe('an answer the CLI cannot make sense of', () => {
  it('is reported against its own Playlist, and does not take the run down', async () => {
    const site = servingItsOwnApi()
    const home = await twoTracked(site, 'jukebox-sync-garbled-')

    // A 502 carrying an HTML page rather than the contract's error envelope --
    // an edge or a rate limiter in front of the API, not the worker. `api.ts`
    // throws on it, because a shape that does not fit the contract is a bug; a
    // Sync must still come back with an answer for every other Playlist.
    site.holding(OTHER_ID, breaking(502, '<html><body>Bad gateway</body></html>'))
    site.holding(ID, snapshot({ ...twoTracks, version: 2, tracks: [track()] }))

    const run = await syncing(site, home)
    const reported = synced(run).playlists

    expect(reported[0]).toMatchObject({ id: OTHER_ID, answer: 'unreachable' })

    // The cause travels rather than being swallowed, so a reply nothing
    // understands is still legible as the bug it may well be.
    expect('message' in reported[0]! && reported[0]!.message).toContain('502')

    // The one behind it was still asked, and its snapshot still applied.
    expect(reported[1]).toMatchObject({ id: ID, answer: 'changed', version: 2 })
    expect(run.code).toBe(0)
  })
})

describe('a backend that cannot be reached at all', () => {
  it('is reported against that Playlist rather than failing the command', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    // The document is saved by the add, so the boot succeeds off the cached copy
    // and it is the API request that meets a closed port.
    const added = await tracking(site, 'jukebox-sync-offline-')
    await site.stop()

    const run = await syncing(site, added.home)
    const reported = synced(run).playlists[0]!

    expect(reported).toMatchObject({ id: ID, answer: 'unreachable' })
    expect('message' in reported && reported.message).toContain('could not reach its backend')

    // Zero, because a scheduled Sync that met a flaky network still asked about
    // everything it tracks and still reported what it found.
    expect(run.code).toBe(0)
  })
})

describe('a Playlist still resolving when its add gave up waiting', () => {
  it('is picked up by the first Sync, and gains its folder name there', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')

    const added = await tracking(site, 'jukebox-sync-pending-')

    // Nothing has read a title, so ADR-0004 has nothing to name a folder after
    // yet. Naming one after the id now would be naming it that for ever.
    expect(playlistRow(added)).toMatchObject({ status: 'pending', folder_name: null })

    site.holding(ID, twoTracks)
    const run = await syncing(site, added.home)

    // Asked outright: a Playlist that has never resolved holds no Version, and
    // so has nothing to claim to be holding.
    expect(synced(run).playlists).toEqual([
      {
        id: ID,
        title: 'Rain / Shine',
        answer: 'changed',
        version: 1,
        added: [
          { trackId: 'spotify:blue-dot', title: 'Blue Dot' },
          { trackId: 'spotify:long-way-down', title: 'Long Way Down' },
        ],
        removed: [],
      },
    ])

    // The first moment there was a title to compute one from.
    expect(playlistRow(added)).toMatchObject({ status: 'ok', folder_name: 'Rain Shine' })
    expect(run.code).toBe(0)
  })
})

describe('a Mirror with nothing in it', () => {
  it('says so rather than printing nothing at all', async () => {
    const site = servingItsOwnApi()

    const run = await syncing(site, temporaryHome('jukebox-sync-empty-'), false)

    expect(run.stdout.trim()).toBe(
      'Nothing is tracked yet. Add a playlist with `jukebox add <url>`.',
    )
    expect(run.code).toBe(0)
  })
})

describe('sync in JSON mode', () => {
  it('writes one object and nothing else', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-json-')
    const run = await syncing(site, added.home)

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'sync' })
    expect(run.stderr).toBe('')
  })
})

describe('what sync leaves on disk', () => {
  it('is the Mirror and the saved document, and nothing else', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const added = await tracking(site, 'jukebox-sync-disk-')
    site.holding(ID, snapshot({ ...twoTracks, version: 2, tracks: [track()] }))
    await syncing(site, added.home)

    // The thing worth catching is a journal or a write-ahead log still sitting
    // there after the handle was closed -- which on Windows is also a file the
    // next run cannot delete.
    expect([...new Bun.Glob('**/*').scanSync(added.home)].sort()).toEqual([
      join('data', 'discovery.json'),
      join('data', MIRROR_FILE),
    ])
  })
})
