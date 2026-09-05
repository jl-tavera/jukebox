import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import { CACHE_FILE } from '../src/cache'
import type { Listed } from '../src/commands/list'
import { MIRROR_FILE } from '../src/mirror'
import { jukebox, oneObject, removeHomes, temporaryHome, type Run } from './harness'
import { REFUSALS, servingItsOwnApi, snapshot, stopServing, track, type Site } from './server'

/**
 * Seam 3: the CLI's command entry point, driven with an argument vector against
 * a home of this run's own.
 *
 * The server is here only to fill a Mirror, because `add` and `sync` are the
 * honest way to get one with something in it. `list` itself must never reach it,
 * and that is said twice below: the site is asked nothing while `list` runs, and
 * `list` runs again once the site has stopped listening.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

/** A second Playlist. `1Ab...` sorts before `3cE...`, so this one is listed first. */
const OTHER = 'https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU'
const OTHER_ID = 'spotify:1AbCdEfGhIjKlMnOpQrStU'

/** Short enough for a test suite to watch `add`'s wait run out. */
const BRIEF = { windowMs: 100, intervalMs: 10 }

/** Nowhere, as `config.test.ts` spells it: a run that quietly booted would fail. */
const NO_SITE = 'http://127.0.0.1:1/discovery.json'

/** Two Tracks and one entry the Source offered that never became one. */
const twoTracks = snapshot({
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track(),
    track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 1 }),
  ],
})

/** Blue Dot has left, Sun Dogs has joined. */
const moved = snapshot({
  version: 2,
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 0 }),
    track({ sourceTrackId: 'sun-dogs', title: 'Sun Dogs', position: 1 }),
  ],
})

const adding = (site: Site, home: string, url: string = URL): Promise<Run> =>
  jukebox(['add', url, '--json'], { discovery: site.url, patience: BRIEF, home })

const syncing = (site: Site, home: string): Promise<Run> =>
  jukebox(['sync', '--json'], { discovery: site.url, home })

/** One `list`, over whatever that home now holds. */
const listing = (site: Site, home: string, json = true): Promise<Run> =>
  jukebox(json ? ['list', '--json'] : ['list'], { discovery: site.url, home })

const listed = (run: Run): Listed => oneObject(run).data as Listed

describe('a Mirror with Playlists in it', () => {
  it('names every one of them, with its status, its tracks and when it last synced', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-all-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    const run = await listing(site, home)
    const playlist = listed(run).playlists[0]

    expect(playlist).toMatchObject({
      id: ID,
      url: URL,
      title: 'Rain / Shine',
      status: 'ok',
      tracks: 2,
      removed: 0,
      skipped: 1,
      lastVersion: 1,
      folderName: 'Rain Shine',
    })
    expect(typeof playlist!.lastSyncedAt).toBe('number')
    expect(run.code).toBe(0)
  })

  it('counts a Removed Track apart from a present one', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-removed-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    site.holding(ID, moved)
    await syncing(site, home)

    // Two present and one Removed, out of a Playlist that has held three rows
    // and deleted none. A single total would hide the departure, which is the
    // one thing the Mirror knows that nothing else does.
    expect(listed(await listing(site, home)).playlists[0]).toMatchObject({
      tracks: 2,
      removed: 1,
    })
  })

  it('lists them in one order, so two runs read the same', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-order-')

    for (const [url, id] of [
      [URL, ID],
      [OTHER, OTHER_ID],
    ] as const) {
      site.tracking(url, { id, status: 'ok' })
      site.holding(id, twoTracks)
      await adding(site, home, url)
    }

    // Added second, listed first: by id, not by when it arrived.
    expect(listed(await listing(site, home)).playlists.map((one) => one.id)).toEqual([
      OTHER_ID,
      ID,
    ])
  })

  it('reads as one line a person can scan', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-human-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    site.holding(ID, moved)
    await syncing(site, home)

    const run = await listing(site, home, false)

    // "updated" rather than "synced": the column behind it only moves when a
    // snapshot arrives, and a Sync answered 304 leaves it exactly where it was.
    expect(run.stdout.trim()).toMatch(
      new RegExp(
        `^"Rain / Shine"\\s+ok\\s+2 tracks, 1 removed` +
          `\\s+updated \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$`,
      ),
    )
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })

  it('calls a Playlist by its name, and says no id at all', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-identifies-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    const run = await listing(site, home, false)

    // The id used to be printed beside every title, because `show` and `remove`
    // took nothing else. They take the name now, so the string a reader needs
    // for the next command is the one already in front of them -- and thirty
    // characters that identified nothing they could not see are gone.
    expect(run.stdout).toContain('"Rain / Shine"')
    expect(run.stdout).not.toContain(ID)
  })

  it('brings the id back on the rows whose name stops identifying them', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-ambiguous-')

    for (const [url, id] of [
      [URL, ID],
      [OTHER, OTHER_ID],
    ] as const) {
      site.tracking(url, { id, status: 'ok' })
      site.holding(id, twoTracks)
      await adding(site, home, url)
    }

    const run = await listing(site, home, false)

    // Two Playlists, one name. A Source lets them share it, so the table has to
    // survive it: the identifier appears exactly where the name has stopped
    // telling two rows apart, and nowhere else.
    expect(run.stdout).toContain(`"Rain / Shine" (${ID})`)
    expect(run.stdout).toContain(`"Rain / Shine" (${OTHER_ID})`)
  })
})

describe('a Playlist still being read from its source', () => {
  it('is listed as pending, with no tracks and no sync behind it', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-pending-')
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')
    await adding(site, home)

    const run = await listing(site, home)

    // Nothing has read a title, so there is none -- and ADR-0004 has nothing to
    // name a folder after yet either.
    expect(listed(run).playlists[0]).toMatchObject({
      id: ID,
      title: null,
      status: 'pending',
      tracks: 0,
      removed: 0,
      lastSyncedAt: null,
      folderName: null,
    })

    const human = await listing(site, home, false)

    // Called by its id, because a title that is absent is absent -- never a
    // placeholder, which nobody downstream could tell from a real title.
    expect(human.stdout).toContain(ID)
    expect(human.stdout).toContain('pending')
    expect(human.stdout).toContain('no tracks')
    expect(human.stdout).toContain('never updated')
  })
})

describe('a Playlist its Source will no longer serve', () => {
  it('is listed as gone, and still shows the tracks it had', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-gone-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    site.holding(ID, REFUSALS.gone)
    await syncing(site, home)

    // A remote failure never costs a reader what they already had.
    expect(listed(await listing(site, home)).playlists[0]).toMatchObject({
      status: 'gone',
      tracks: 2,
      removed: 0,
    })
  })
})

describe('a Mirror with nothing in it', () => {
  it('says so rather than printing nothing at all, and succeeds', async () => {
    const site = servingItsOwnApi()
    const run = await listing(site, temporaryHome('jukebox-list-empty-'), false)

    // The same sentence `sync` says, to the same reader, about the same Mirror.
    expect(run.stdout.trim()).toBe(
      'Nothing is tracked yet. Add a playlist with `jukebox add <url>`.',
    )
    expect(run.code).toBe(0)
  })
})

describe('list with no network', () => {
  it('asks the outside world nothing at all', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-offline-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    // Counted from here, so the `add` above does not pay for `list`.
    site.forgets()
    const run = await listing(site, home)

    // Not one request: not the discovery document, not the API. A command that
    // never asks the session for a backend cannot open the door at all, which is
    // what makes "works offline" a property of the shape rather than a list
    // somebody has to keep in step.
    expect(site.asked).toEqual([])
    expect(listed(run).playlists).toHaveLength(1)
  })

  it('answers with nowhere to boot from and no saved document to fall back on', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-nowhere-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    // Both halves, because either alone would pass a `list` that booted. The
    // `add` above saved a discovery document, and a boot handed a fresh saved
    // copy returns from it without a single request -- so pointing at a closed
    // port proves nothing until that copy is gone as well. With both, a `list`
    // that reached for a backend would raise `network_unreachable` and exit 1.
    const run = await jukebox(['list', '--json'], {
      discovery: NO_SITE,
      home,
      prepare: (where) => rmSync(join(where.data, CACHE_FILE)),
    })

    expect(listed(run).playlists[0]).toMatchObject({ id: ID, tracks: 2 })
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('what list leaves on disk', () => {
  it('is the Mirror, which it creates in order to find it empty', async () => {
    const home = temporaryHome('jukebox-list-disk-')

    const run = await jukebox(['list'], { discovery: NO_SITE, home })

    // A decision rather than an accident. `withMirror` opens with `create: true`,
    // so the first `list` on a new machine writes an empty Mirror in order to
    // say there is nothing in it. The alternative is a second path that reads a
    // database which may not be there, and two answers to "is it there" is worse
    // than one file. Nothing else appears: no configuration file, and no saved
    // discovery document, because nothing here booted.
    expect([...new Bun.Glob('**/*').scanSync(home)].sort()).toEqual([join('data', MIRROR_FILE)])
    expect(run.code).toBe(0)
  })
})

describe('list in JSON mode', () => {
  it('writes one object and nothing else', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-list-json-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)

    const run = await listing(site, home)

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'list' })
    expect(run.stderr).toBe('')
  })
})
