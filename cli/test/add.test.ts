import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { afterAll, describe, expect, it } from 'bun:test'
import type { Added } from '../src/commands/add'
import { MIRROR_FILE } from '../src/mirror'
import {
  jukebox,
  mirrorOf,
  oneObject,
  removeHomes,
  temporaryHome,
  type Options,
  type Run,
} from './harness'
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
 * A real server rather than a replaced `fetch`, which spec #29 asks for by name.
 * The Mirror is a real database in a real temporary directory for the same
 * reason, and it is the worker's choice of real bindings over mocks made again on
 * this side.
 *
 * Assertions land on the result object every command computes, on the exit code,
 * and on what the Mirror says afterwards -- never on which statement ran or in
 * what order.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

/**
 * Short enough for a test suite to watch a wait run out.
 *
 * The shipped window is thirty seconds, which is right for somebody at a terminal
 * and impossible here. Shortening it is the only reason `Seams` carries a
 * patience at all.
 */
const BRIEF = { windowMs: 100, intervalMs: 10 }

/** One `add`, in JSON mode, against a server that serves both surfaces. */
const adding = (site: Site, options: Options = {}, url: string = URL) =>
  jukebox(['add', url, '--json'], { discovery: site.url, patience: BRIEF, ...options })

const added = (run: Run): Added => oneObject(run).data as Added

const refusal = (run: Run) => oneObject(run).error as { code: string; message: string }

/** How many times this run asked for the Playlist's Tracks. */
const polls = (site: Site): number =>
  site.asked.filter((request) => request.path.endsWith('/tracks')).length

const trackIds = (run: Run): string[] =>
  mirrorOf(run, (mirror) =>
    mirror
      .query<{ track_id: string }, []>('SELECT track_id FROM tracks ORDER BY position')
      .all()
      .map((row) => row.track_id),
  )

/** Two Tracks and one entry the Source offered that never became one. */
const twoTracks = snapshot({
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track(),
    track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 1 }),
  ],
})

describe('a Playlist that resolves while add is waiting', () => {
  it('is recorded, and its Tracks with it', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving', twoTracks)

    const run = await adding(site)

    expect(added(run)).toEqual({
      id: ID,
      title: 'Rain / Shine',
      status: 'ok',
      tracks: 2,
      skipped: 1,
      folderName: 'Rain Shine',
    })
    expect(run.code).toBe(0)
  })

  it('says its name and its Skipped count out loud', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, twoTracks)

    // Human output, because both of these are things a person reads. The Skipped
    // count is said so that a number lower than the one the Source shows does not
    // read as data loss.
    const run = await jukebox(['add', URL], { discovery: site.url, patience: BRIEF })

    expect(run.stdout).toContain('Rain / Shine')
    expect(run.stdout).toContain('2 tracks')
    expect(run.stdout).toContain('1 entry skipped')
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })

  it('stores Track ids namespaced by the Source its Playlist names', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, twoTracks)

    const run = await adding(site)

    // ADR-0001's form. The API sends `sourceTrackId` bare and carries no Source
    // of its own, so the Source can only have come from the Playlist's id.
    expect(trackIds(run)).toEqual(['spotify:blue-dot', 'spotify:long-way-down'])
  })

  it('needs no wait at all when the Playlist has already resolved', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const run = await adding(site)

    expect(added(run).status).toBe('ok')
    // One ask and no waiting. `add` does not branch on the status the create
    // answered with -- a Playlist whose Tracks are there answers the first ask,
    // and that is the same thing.
    expect(polls(site)).toBe(1)
  })
})

describe('a Playlist still resolving when the wait runs out', () => {
  it('exits cleanly, tracked, and says to sync shortly', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')

    const run = await jukebox(['add', URL], { discovery: site.url, patience: BRIEF })

    // Zero, because the Playlist is tracked and the Resolution is under way.
    // Every add is a cold Resolution, so this is the answer `add` gives most
    // often, and a command that failed on it could not be put in a script.
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('jukebox sync')
    expect(run.stderr).toBe('')
  })

  it('is Pending in the result rather than absent from it', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')

    const run = await adding(site)

    expect(added(run)).toEqual({
      id: ID,
      title: null,
      status: 'pending',
      tracks: 0,
      skipped: null,
      folderName: null,
    })
  })

  it('asked more than once, and then stopped asking', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')

    await adding(site)

    // More than one, or it did not poll. Bounded by the window it was given, or
    // it did not stop -- and the whole of the acceptance criterion is that both
    // are true at once.
    const asked = polls(site)
    expect(asked).toBeGreaterThan(1)
    expect(asked).toBeLessThanOrEqual(BRIEF.windowMs / BRIEF.intervalMs + 1)
  })

  it('has no folder name yet, because nothing has read a title to make one from', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')

    const run = await adding(site)

    // ADR-0004 forbids renaming a folder, so naming one after the id now would
    // be naming it after the id for ever. It waits for a title instead.
    expect(
      mirrorOf(run, (mirror) =>
        mirror
          .query<{ folder_name: string | null; status: string }, []>(
            'SELECT folder_name, status FROM playlists',
          )
          .all(),
      ),
    ).toEqual([{ folder_name: null, status: 'pending' }])
  })
})

describe('a URL no Source claims', () => {
  it('is refused in the API"s own words, and records nothing', async () => {
    const site = servingItsOwnApi()

    const run = await adding(site, {}, 'https://open.spotify.com/track/4rzfv0JLZfVhOhbSQ8o5jZ')

    expect(refusal(run)).toEqual({
      code: 'invalid_url',
      message: REFUSALS.invalidUrl.message,
    })
    expect(run.code).toBe(1)

    // Nothing was tracked, so nothing is recorded. A row for a Playlist the
    // server never accepted would be one only this machine believes in.
    expect(
      mirrorOf(run, (mirror) =>
        mirror.query<{ n: number }, []>('SELECT count(*) AS n FROM playlists').get()?.n,
      ),
    ).toBe(0)
  })
})

describe('a Playlist its Source refuses', () => {
  it('carries its own code, and the sentence the server wrote', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, REFUSALS.gone)

    const run = await adding(site)

    // Printed verbatim and branched on by code, which is what the contract's
    // error envelope was designed for: the copy improves without a client
    // release.
    expect(refusal(run)).toEqual({ code: 'playlist_gone', message: REFUSALS.gone.message })
    expect(run.code).toBe(1)
  })
})

describe('a Source that cannot be read', () => {
  it('is a different code from a Playlist that is gone', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, REFUSALS.unavailable)

    const run = await adding(site)

    expect(refusal(run)).toEqual({
      code: 'source_unavailable',
      message: REFUSALS.unavailable.message,
    })
    expect(run.code).toBe(1)
  })
})

describe('a refusal that arrives while add is waiting', () => {
  it('is recorded against the Playlist that is already tracked', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving', REFUSALS.gone)

    const run = await adding(site)

    expect(refusal(run).code).toBe('playlist_gone')

    // The Playlist was recorded before the answer came, so the answer is worth
    // recording too: nothing should go on calling it Pending once a permanent
    // answer has arrived.
    expect(
      mirrorOf(run, (mirror) =>
        mirror.query<{ status: string }, []>('SELECT status FROM playlists').get()?.status,
      ),
    ).toBe('gone')
  })
})

describe('a backend that cannot be reached', () => {
  it('says so rather than failing in whatever way it happens to fail', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, twoTracks)

    // A run with the document already saved, so the boot succeeds off the cached
    // copy and it is the API request that meets a closed port. That is the split
    // worth having: `list` and `show` work offline, and `add` cannot.
    const home = temporaryHome('jukebox-add-offline-')
    await adding(site, { home })
    await site.stop()

    const run = await adding(site, { home })

    expect(refusal(run).code).toBe('network_unreachable')
    expect(run.code).toBe(1)
  })
})

/**
 * The other half of `sync.test.ts`'s "an answer the CLI cannot make sense of",
 * and it is here because for a long time it was only there.
 *
 * `sync` folded a reply it could not read into `unreachable` and `add` did not,
 * so the same 502 from an edge was one Playlist's problem under one command and
 * `unexpected` -- the code that says of itself that it is always a bug here --
 * under the other. #70 moved the fold into `api.ts`, which is what makes these
 * two the same question asked at both of `add`'s requests.
 */
describe('an answer add cannot make sense of', () => {
  it('is a backend that gave no answer, not a bug in Jukebox', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'pending' })

    // A 502 carrying an HTML page rather than the contract's error envelope --
    // an edge or a rate limiter in front of the API, not the worker.
    site.holding(ID, breaking(502, '<html><body>Bad gateway</body></html>'))

    const run = await adding(site)

    expect(refusal(run).code).toBe('network_unreachable')

    // The cause travels rather than being swallowed, so a reply nothing
    // understands is still legible as the bug it may well be.
    expect(refusal(run).message).toContain('502')
    expect(run.code).toBe(1)
  })

  it('is the same answer when the very first request meets one', async () => {
    const site = servingItsOwnApi()

    // Nothing is tracked by the time this arrives, so this is the one an `add`
    // meets before it has an id to poll for -- and the request `sync` never
    // makes, which is why nothing exercised this path before.
    site.tracking(URL, breaking(502, '<html><body>Bad gateway</body></html>'))

    const run = await adding(site)

    expect(refusal(run).code).toBe('network_unreachable')
    expect(refusal(run).message).toContain('502')
    expect(run.code).toBe(1)

    // Nothing was recorded. The Playlist has no id, and a row for one the server
    // never accepted would be a Playlist only this machine believes in.
    expect(
      mirrorOf(run, (mirror) =>
        mirror.query<{ n: number }, []>('SELECT count(*) AS n FROM playlists').get()?.n,
      ),
    ).toBe(0)
  })
})

describe('adding a Playlist already tracked', () => {
  it('is harmless, and duplicates nothing', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const home = temporaryHome('jukebox-add-twice-')

    const first = await adding(site, { home })
    const rows = () =>
      mirrorOf(first, (mirror) => ({
        playlists: mirror.query<{ n: number }, []>('SELECT count(*) AS n FROM playlists').get()!.n,
        tracks: mirror
          .query<{ track_id: string; added_at: number; removed_at: number | null }, []>(
            'SELECT track_id, added_at, removed_at FROM tracks ORDER BY track_id',
          )
          .all(),
      }))

    const before = rows()
    const second = await adding(site, { home })

    expect(added(second)).toEqual(added(first))
    expect(second.code).toBe(0)

    // The same snapshot applied twice reaches the same rows and leaves them
    // saying the same thing -- including the moment each Track joined, which a
    // second application must not move. That idempotence is what makes an
    // interrupted Sync safe to rerun.
    expect(rows()).toEqual(before)
    expect(before.playlists).toBe(1)
    expect(before.tracks).toHaveLength(2)
    expect(before.tracks.every((row) => row.removed_at === null)).toBe(true)
  })
})

describe('what add leaves on disk', () => {
  it('is the Mirror and the saved document, and nothing else', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const run = await adding(site)

    // `cli.test.ts` asserts a command that needs no Mirror leaves its home
    // completely empty; this is the other half of that. Named exactly, because
    // the thing worth catching is a journal or a write-ahead log still sitting
    // there after the handle was closed -- which on Windows is also a file the
    // next run cannot delete.
    expect([...new Bun.Glob('**/*').scanSync(run.home)].sort()).toEqual([
      join('data', 'discovery.json'),
      join('data', MIRROR_FILE),
    ])
  })
})

describe('add in JSON mode', () => {
  it('writes one object and nothing else', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const run = await adding(site)

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'add' })
    expect(run.stderr).toBe('')
  })

  it('names the command it failed in', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, REFUSALS.gone)

    const run = await adding(site)

    expect(oneObject(run)).toMatchObject({ ok: false, command: 'add' })
  })
})
