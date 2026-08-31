import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { afterAll, describe, expect, it } from 'bun:test'
import { MIRROR_FILE } from '../src/mirror'
import { MIGRATIONS, SCHEMA_VERSION } from '../src/migrations'
import type { Locations } from '../src/paths'
import { jukebox, mirrorOf, oneObject, removeHomes, temporaryHome, type Run } from './harness'
import { servingItsOwnApi, snapshot, stopServing, track } from './server'

/**
 * Seam 3 again, pointed at the Mirror rather than at what a command says.
 *
 * The Mirror is created by the first command that needs one, so everything here
 * is driven through `add` -- there is no separate "open the database" a user can
 * ask for, and inventing one for a test would be a seam the product does not
 * have.
 *
 * What the migration runner does is only observable if there is an earlier
 * version to open. `prepare` writes one, by running the first migration and
 * nothing after it, which is a Mirror exactly as an earlier release would have
 * left it.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

const BRIEF = { windowMs: 100, intervalMs: 10 }

const resolved = snapshot({ title: 'Rain Shine', tracks: [track()] })

/** A run of `add` against a server that answers it, in JSON mode. */
const adding = (prepare?: (where: Locations) => void) => {
  const site = servingItsOwnApi()
  site.tracking(URL, { id: ID, status: 'ok' })
  site.holding(ID, resolved)

  return jukebox(['add', URL, '--json'], {
    discovery: site.url,
    patience: BRIEF,
    prepare,
  })
}

const versionOf = (run: Run): number =>
  mirrorOf(
    run,
    (mirror) =>
      mirror.query<{ version: number }, []>('SELECT version FROM schema_version').get()!.version,
  )

const tables = (run: Run): string[] =>
  mirrorOf(run, (mirror) =>
    mirror
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      )
      .all()
      .map((row) => row.name),
  )

/** A Mirror as the release that shipped only the first migration would have left it. */
const asItWasAtVersionOne = (where: Locations) => {
  mkdirSync(where.data, { recursive: true })

  const mirror = new Database(join(where.data, MIRROR_FILE), { create: true, strict: true })
  mirror.exec(MIGRATIONS[0]!.sql)
  mirror.run('INSERT INTO schema_version (id, version) VALUES (1, 1)')
  mirror.run(
    `INSERT INTO playlists (id, url, title, folder_name, status)
     VALUES ('spotify:older', 'https://open.spotify.com/playlist/older', 'From Before',
             'From Before', 'ok')`,
  )
  mirror.close()
}

describe('the Mirror, on first use', () => {
  it('is created by the command that needs it, with its version recorded', async () => {
    const run = await adding()

    expect(run.code).toBe(0)
    expect(versionOf(run)).toBe(SCHEMA_VERSION)
  })

  it('holds the two tables the release has something to put in, and no others', async () => {
    const run = await adding()

    // No events log, and no table for anything Fetching would need. A table
    // nothing fills is the mistake the worker's own migrations named, and this is
    // the release with the least excuse to make it.
    expect(tables(run)).toEqual(['playlists', 'schema_version', 'tracks'])
  })

  it('carries no column for anything nothing can produce', async () => {
    const run = await adding()

    const columns = mirrorOf(run, (mirror) =>
      mirror
        .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('tracks')`)
        .all()
        .map((row) => row.name),
    )

    // Fetching does not exist: no Catalog is consulted and no response carries
    // anything to download. So there is nowhere to write a match, a path, a
    // checksum, a byte count or a download time, and a column that says something
    // untrue is worse than one that is not there.
    for (const absent of ['match', 'file_path', 'checksum', 'bytes', 'downloaded_at', 'state']) {
      expect(columns).not.toContain(absent)
    }
  })
})

describe('a Mirror written by an earlier release', () => {
  it('is brought up to date without losing what is in it', async () => {
    const run = await adding(asItWasAtVersionOne)

    expect(run.code).toBe(0)
    expect(versionOf(run)).toBe(SCHEMA_VERSION)

    // The row that was there before the upgrade is still there, and still says
    // what it said. A migration that loses a Playlist is the whole reason a
    // schema version ships in the first release rather than the first one that
    // needs it.
    expect(
      mirrorOf(run, (mirror) =>
        mirror
          .query<{ id: string; title: string; folder_name: string }, [string]>(
            'SELECT id, title, folder_name FROM playlists WHERE id = ?',
          )
          .get('spotify:older'),
      ),
    ).toEqual({
      id: 'spotify:older',
      title: 'From Before',
      folder_name: 'From Before',
    })
  })

  it('gains the table the upgrade adds, and the command uses it', async () => {
    const run = await adding(asItWasAtVersionOne)

    expect(tables(run)).toContain('tracks')
    expect(
      mirrorOf(run, (mirror) =>
        mirror.query<{ n: number }, []>('SELECT count(*) AS n FROM tracks').get()!.n,
      ),
    ).toBe(1)
  })

  it('does not collide with the folder name an earlier row already holds', async () => {
    // `Rain Shine` for the new Playlist, and `From Before` for the old one --
    // different names, so nothing is suffixed. The point of the case is that the
    // names already spoken for are read from a table the upgrade just rewrote.
    const run = await adding(asItWasAtVersionOne)

    expect((oneObject(run).data as { folderName: string }).folderName).toBe('Rain Shine')
  })
})

describe('a Mirror written by a newer release', () => {
  it('stops rather than reading a shape it does not know', async () => {
    const run = await adding((where) => {
      asItWasAtVersionOne(where)

      const mirror = new Database(join(where.data, MIRROR_FILE), { strict: true })
      mirror.run('UPDATE schema_version SET version = 99 WHERE id = 1')
      mirror.close()
    })

    // The same decision the discovery document's version gate makes in the other
    // direction. A column this binary has never heard of is one it would drop on
    // the next write, so it says so instead of writing.
    const error = oneObject(run).error as { code: string; message: string }
    expect(error.code).toBe('mirror_unopenable')
    expect(error.message).toContain('newer Jukebox')
    expect(run.code).toBe(1)
  })
})

describe('a Mirror that cannot be opened at all', () => {
  it('is its own failure, not a bug and not a network problem', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, resolved)

    const home = temporaryHome('jukebox-mirror-blocked-')

    const run = await jukebox(['add', URL, '--json'], {
      home,
      discovery: site.url,
      patience: BRIEF,
      // A file where the data directory has to go, which is the cheapest way to
      // make a real directory refuse to be created.
      prepare: (where) => void writeFileSync(where.data, 'not a directory\n'),
    })

    const error = oneObject(run).error as { code: string; message: string }
    expect(error.code).toBe('mirror_unopenable')
    expect(run.code).toBe(1)

    // Nothing was tracked. The boot runs first -- so that a binary the version
    // gate refuses never creates a database on its way out -- and the Playlist is
    // never asked about, because there is nowhere to put the answer.
    expect(site.asked.map((request) => request.path)).toEqual(['/discovery.json'])
  })
})
