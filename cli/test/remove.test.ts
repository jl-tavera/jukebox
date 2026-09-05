import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import { CACHE_FILE } from '../src/cache'
import type { Listed } from '../src/commands/list'
import { LOCAL_ONLY, type Untracked } from '../src/commands/remove'
import { jukebox, mirrorOf, oneObject, removeHomes, temporaryHome, type Run } from './harness'
import { servingItsOwnApi, snapshot, stopServing, track, type Site } from './server'

/**
 * Seam 3, driving the one command in the CLI that deletes anything.
 *
 * Everywhere else a Playlist that goes wrong keeps what it had. This is the
 * place a person has asked, and the two things worth protecting are that it
 * takes the Tracks with it and that it says out loud how little else it does.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

const OTHER = 'https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU'
const OTHER_ID = 'spotify:1AbCdEfGhIjKlMnOpQrStU'

const BRIEF = { windowMs: 100, intervalMs: 10 }

/** Nowhere, as `config.test.ts` spells it: a run that quietly booted would fail. */
const NO_SITE = 'http://127.0.0.1:1/discovery.json'

const twoTracks = snapshot({
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track(),
    track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 1 }),
  ],
})

/** Blue Dot has left. */
const moved = snapshot({
  version: 2,
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 0 })],
})

const adding = (site: Site, home: string, url: string = URL): Promise<Run> =>
  jukebox(['add', url, '--json'], { discovery: site.url, patience: BRIEF, home })

const syncing = (site: Site, home: string): Promise<Run> =>
  jukebox(['sync', '--json'], { discovery: site.url, home })

/** One `remove`, over whatever that home now holds. */
const removing = (site: Site, home: string, reference: string, json = true): Promise<Run> =>
  jukebox(json ? ['remove', reference, '--json'] : ['remove', reference], {
    discovery: site.url,
    home,
  })

const untracked = (run: Run): Untracked => oneObject(run).data as Untracked

const listing = (site: Site, home: string): Promise<Run> =>
  jukebox(['list', '--json'], { discovery: site.url, home })

const stillTracked = async (site: Site, home: string): Promise<string[]> =>
  ((oneObject(await listing(site, home)).data as Listed).playlists ?? []).map((one) => one.id)

/** A home holding one Playlist of two Tracks. */
const tracked = async (site: Site, name: string): Promise<string> => {
  const home = temporaryHome(name)
  site.tracking(URL, { id: ID, status: 'ok' })
  site.holding(ID, twoTracks)
  await adding(site, home)
  return home
}

describe('a Playlist somebody has finished with', () => {
  it('is no longer tracked afterwards', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-gone-')

    const run = await removing(site, home, ID)

    expect(untracked(run)).toMatchObject({ id: ID, title: 'Rain / Shine', tracks: 2, removed: 0 })
    expect(await stillTracked(site, home)).toEqual([])
    expect(run.code).toBe(0)
  })

  it('takes its Tracks with it', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-cascade-')

    const run = await removing(site, home, ID)

    // Read out of the database rather than through a command, and this is one
    // of the few things that has to be: an orphaned Track row is invisible to
    // every command by definition, because the Playlist that would have shown
    // it is gone. It is also exactly what would happen if `PRAGMA foreign_keys`
    // were ever turned off, which is the failure this asserts against.
    expect(
      mirrorOf(run, (mirror) =>
        mirror.query<{ n: number }, []>('SELECT count(*) AS n FROM tracks').get()!.n,
      ),
    ).toBe(0)

    // And from the outside: asking after it is now the same as asking after a
    // Playlist that was never added.
    const asked = await jukebox(['show', ID, '--json'], { discovery: site.url, home })
    expect(oneObject(asked)).toMatchObject({ error: { code: 'playlist_not_tracked' } })
  })

  it('counts the Tracks that had already left the Playlist as well', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-counts-')
    site.holding(ID, moved)
    await syncing(site, home)

    // One present and one that left. Both are rows, and both go.
    expect(untracked(await removing(site, home, ID))).toMatchObject({ tracks: 1, removed: 1 })
  })

  it('leaves every other Playlist exactly where it was', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-scoped-')
    site.tracking(OTHER, { id: OTHER_ID, status: 'ok' })
    site.holding(OTHER_ID, twoTracks)
    await adding(site, home, OTHER)

    await removing(site, home, ID)

    expect(await stillTracked(site, home)).toEqual([OTHER_ID])
  })
})

describe('what remove is careful to say', () => {
  it('states plainly that it changed nothing but this machine', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-says-')

    const run = await removing(site, home, ID, false)

    // Pinned to the constant rather than to a paraphrase, so the sentence
    // cannot be softened without this failing. A reader could reasonably assume
    // the opposite -- that Jukebox told the source, or told anyone else.
    expect(run.stdout).toContain(LOCAL_ONLY)
    expect(run.code).toBe(0)
  })

  it('says it in the help too, before anybody has run it', async () => {
    const run = await jukebox(['remove', '--help'], { discovery: NO_SITE })

    // The spec puts this in the help and not only in the output, because the
    // moment to learn it is before the command, not after.
    expect(run.stdout.toLowerCase()).toContain('this machine')
    expect(run.code).toBe(0)
  })

  it('names the address to add it back with', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-undo-')

    // The undo, written out to be pasted. It is also the argument against a
    // confirmation prompt: what this deletes can be asked for again.
    expect((await removing(site, home, ID, false)).stdout).toContain(`jukebox add ${URL}`)
  })

  it('carries the same sentence to a machine caller', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-json-note-')

    const run = await removing(site, home, ID)

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'remove' })
    expect(untracked(run).note).toBe(LOCAL_ONLY)
    expect(run.stderr).toBe('')
  })
})

describe('naming the Playlist to remove', () => {
  it('takes the address it was added with', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-by-url-')

    expect(untracked(await removing(site, home, URL)).id).toBe(ID)
    expect(await stillTracked(site, home)).toEqual([])
  })

  it('refuses one the Mirror does not hold, and does not report success', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-unknown-')

    const run = await removing(site, home, 'spotify:nothing-like-it')

    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'remove',
      error: { code: 'playlist_not_tracked' },
    })
    expect(run.code).toBe(1)

    // And it removed nothing on the way past.
    expect(await stillTracked(site, home)).toEqual([ID])
  })
})

describe('a Playlist removed and wanted back', () => {
  it('is tracked again by adding it, because the server never knew', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-readd-')

    await removing(site, home, ID)
    await adding(site, home)

    // The Mirror is rebuildable from a server snapshot, which is what CONTEXT.md
    // means by authoritative for local state only -- and what makes deleting
    // these rows a recoverable thing to do.
    expect(await stillTracked(site, home)).toEqual([ID])
  })
})

describe('remove with no network', () => {
  it('asks the outside world nothing at all', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-offline-')

    site.forgets()
    const run = await removing(site, home, ID)

    // Nothing is asked because there is nothing to ask: the worker has no notion
    // of who tracks what, and no endpoint that could be told this happened.
    expect(site.asked).toEqual([])
    expect(untracked(run).id).toBe(ID)
  })

  it('answers with nowhere to boot from and no saved document to fall back on', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-remove-nowhere-')

    const run = await jukebox(['remove', ID, '--json'], {
      discovery: NO_SITE,
      home,
      prepare: (where) => rmSync(join(where.data, CACHE_FILE)),
    })

    expect(untracked(run).id).toBe(ID)
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })
})

/** What a confirmation takes. A letter answers it at once, with no return behind it. */
const YES = 'y'
const NO = 'n'

describe('a Playlist named by its title rather than its handle', () => {
  /** A home holding one Playlist called `Rain / Shine`. */
  const oneNamed = async (site: Site, name: string): Promise<string> => {
    const home = temporaryHome(name)
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)
    await adding(site, home)
    return home
  }

  /** What that home still tracks, asked the way any caller would ask it. */
  const stillTracked = async (site: Site, home: string): Promise<string[]> => {
    const run = await jukebox(['list', '--json'], { discovery: site.url, home })
    return ((oneObject(run).data as Listed).playlists ?? []).map((one) => one.id)
  }

  it('asks first, and deletes nothing when the answer is no', async () => {
    const site = servingItsOwnApi()
    const home = await oneNamed(site, 'jukebox-remove-declined-')

    const run = await jukebox(['remove', 'Rain / Shine'], {
      discovery: site.url,
      home,
      keys: [NO],
    })

    // Nothing went wrong, so nothing is reported as having gone wrong: a person
    // was asked what they wanted and got it.
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('Nothing was deleted')
    expect(await stillTracked(site, home)).toEqual([ID])
  })

  it('removes it when the answer is yes', async () => {
    const site = servingItsOwnApi()
    const home = await oneNamed(site, 'jukebox-remove-confirmed-')

    const run = await jukebox(['remove', 'Rain / Shine'], {
      discovery: site.url,
      home,
      keys: [YES],
    })

    expect(run.code).toBe(0)
    expect(run.stdout).toContain('Stopped tracking')
    expect(await stillTracked(site, home)).toEqual([])
  })

  it('asks nothing at all when it was given an id', async () => {
    const site = servingItsOwnApi()
    const home = await oneNamed(site, 'jukebox-remove-by-id-')

    // No keys scripted, so a prompt would hang rather than fail -- which is the
    // assertion. An id names exactly one row and always has, so nothing about
    // this path changed when a title became a handle.
    const run = await jukebox(['remove', ID], { discovery: site.url, home })

    expect(run.code).toBe(0)
    expect(await stillTracked(site, home)).toEqual([])
  })

  it('refuses a name outright where there is nobody to ask', async () => {
    const site = servingItsOwnApi()
    const home = await oneNamed(site, 'jukebox-remove-unattended-')

    // `--json` is something parsing the output rather than somebody reading it.
    // A prompt there would hang a cron entry, so the answer is an error, and the
    // error carries the handle that would have worked.
    const run = await removing(site, home, 'Rain / Shine')
    const answered = oneObject(run)

    expect(answered.ok).toBe(false)
    expect((answered.error as { code: string }).code).toBe('invalid_usage')
    expect((answered.error as { message: string }).message).toContain(ID)
    expect(run.code).toBe(1)
    expect(await stillTracked(site, home)).toEqual([ID])
  })

  it('refuses a name that two Playlists answer to, and says which', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-remove-ambiguous-')

    // A Source lets two Playlists share a name, which is the whole reason the
    // lookup stopped taking the first row it found.
    for (const [url, id] of [
      [URL, ID],
      [OTHER, OTHER_ID],
    ] as const) {
      site.tracking(url, { id, status: 'ok' })
      site.holding(id, twoTracks)
      await adding(site, home, url)
    }

    const answered = oneObject(await removing(site, home, 'Rain / Shine'))

    const said = (answered.error as { message: string }).message

    expect((answered.error as { code: string }).code).toBe('playlist_ambiguous')

    // Named as well as identified. A title is matched with its case folded and
    // its quotes stripped, so the two rows that collided can read visibly
    // differently -- and a list of bare ids would show a reader neither the
    // thing they typed nor the thing that answered to it.
    expect(said).toContain(`"Rain / Shine" (${ID})`)
    expect(said).toContain(`"Rain / Shine" (${OTHER_ID})`)

    // Refused means refused: both are still here.
    expect((await stillTracked(site, home)).sort()).toEqual([OTHER_ID, ID].sort())
  })
})
