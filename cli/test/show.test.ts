import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import { CACHE_FILE } from '../src/cache'
import type { Shown } from '../src/commands/show'
import { jukebox, oneObject, removeHomes, temporaryHome, type Run } from './harness'
import { servingItsOwnApi, snapshot, stopServing, track, type Site } from './server'

/**
 * Seam 3, pointed at one Playlist.
 *
 * The server fills the Mirror and then has no further part in it: `show` reads
 * what `add` and `sync` left behind. What is worth protecting here is that a
 * Removed Track is still on the screen -- its row is the only record anyone has
 * that the Track was ever in the Playlist, and a `show` that filtered it out
 * would throw away the reason the column exists.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

const BRIEF = { windowMs: 100, intervalMs: 10 }

/** Nowhere, as `config.test.ts` spells it: a run that quietly booted would fail. */
const NO_SITE = 'http://127.0.0.1:1/discovery.json'

/**
 * Two Tracks and one entry the Source offered that never became one, which is
 * why the second Track sits at position 2 rather than 1.
 */
const twoTracks = snapshot({
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track(),
    track({
      sourceTrackId: 'long-way-down',
      title: 'Long Way Down',
      artists: ['Aria Fenn', 'Kit Marlow'],
      position: 2,
    }),
  ],
})

/** Blue Dot has left. Long Way Down has taken the position it held. */
const moved = snapshot({
  version: 2,
  title: 'Rain / Shine',
  skipped: 1,
  tracks: [
    track({
      sourceTrackId: 'long-way-down',
      title: 'Long Way Down',
      artists: ['Aria Fenn', 'Kit Marlow'],
      position: 0,
    }),
  ],
})

const adding = (site: Site, home: string, url: string = URL): Promise<Run> =>
  jukebox(['add', url, '--json'], { discovery: site.url, patience: BRIEF, home })

const syncing = (site: Site, home: string): Promise<Run> =>
  jukebox(['sync', '--json'], { discovery: site.url, home })

/** One `show`, over whatever that home now holds. */
const showing = (site: Site, home: string, reference: string, json = true): Promise<Run> =>
  jukebox(json ? ['show', reference, '--json'] : ['show', reference], {
    discovery: site.url,
    home,
  })

const shown = (run: Run): Shown => oneObject(run).data as Shown

/** A home holding one Playlist of two Tracks, one entry Skipped. */
const tracked = async (site: Site, name: string): Promise<string> => {
  const home = temporaryHome(name)
  site.tracking(URL, { id: ID, status: 'ok' })
  site.holding(ID, twoTracks)
  await adding(site, home)
  return home
}

describe('a Playlist the Mirror holds', () => {
  it('lists its Tracks in the Source own order, with what the Source said about each', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-order-')

    const { playlist, tracks, removed } = shown(await showing(site, home, ID))

    expect(playlist).toMatchObject({ id: ID, title: 'Rain / Shine', status: 'ok', skipped: 1 })
    expect(removed).toEqual([])
    const described = tracks.map((one) => [one.title, one.artists, one.album, one.durationMs])

    expect(tracks.map((one) => one.trackId)).toEqual([
      'spotify:blue-dot',
      'spotify:long-way-down',
    ])
    expect(described).toEqual([
      ['Blue Dot', ['Aria Fenn'], 'Ninety Miles', 214_000],
      ['Long Way Down', ['Aria Fenn', 'Kit Marlow'], 'Ninety Miles', 214_000],
    ])
  })

  it('reads for a person with the title, the artists, the album and the duration', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-human-')

    const run = await showing(site, home, ID, false)

    // The name alone. The id used to be here because this was the screen
    // somebody copied it off in order to run `remove`; that command takes the
    // name now, so the heading says what the reader would type.
    expect(run.stdout).toContain('"Rain / Shine"')
    expect(run.stdout).not.toContain(ID)
    expect(run.stdout).toContain('2 tracks')

    // Several artists joined for a reader, and the duration as a person writes
    // one rather than as milliseconds.
    expect(run.stdout).toContain('Long Way Down')
    expect(run.stdout).toContain('Aria Fenn, Kit Marlow')
    expect(run.stdout).toContain('Ninety Miles')
    expect(run.stdout).toContain('3:34')
    expect(run.code).toBe(0)
  })

  it('counts out loud the entries its Source offered that never became Tracks', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-skipped-')

    // Always said, the way `add` says it: a count lower than the one the Source
    // shows must not read as data loss, and a Skipped entry leaves nothing on
    // the screen to notice.
    expect((await showing(site, home, ID, false)).stdout).toContain('1 entry skipped')
  })
})

describe('a Track its Source no longer lists', () => {
  const withADeparture = async (site: Site, name: string): Promise<string> => {
    const home = await tracked(site, name)
    site.holding(ID, moved)
    await syncing(site, home)
    return home
  }

  it('is still shown, apart from the ones that are still there', async () => {
    const site = servingItsOwnApi()
    const home = await withADeparture(site, 'jukebox-show-removed-')

    const { tracks, removed } = shown(await showing(site, home, ID))

    // Kept, not hidden. The Mirror's row is the only thing that knows Blue Dot
    // was ever in this Playlist -- the worker stores current membership.
    expect(tracks.map((one) => one.trackId)).toEqual(['spotify:long-way-down'])
    expect(removed.map((one) => one.trackId)).toEqual(['spotify:blue-dot'])
    expect(removed[0]!.removedAt).toBeGreaterThan(0)
  })

  it('is distinguished on screen, and dated', async () => {
    const site = servingItsOwnApi()
    const home = await withADeparture(site, 'jukebox-show-removed-human-')

    // Wide enough to keep every column. A Removed row is the longest one this
    // table has -- it is the only one carrying a date -- so it is the row that
    // decides whether anything has to give.
    const run = await jukebox(['show', ID], { discovery: site.url, home, columns: 100 })

    expect(run.stdout).toContain('Removed')
    expect(run.stdout).toMatch(/^ {2}- {3}Blue Dot/m)
    expect(run.stdout).toMatch(/left \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    expect(run.code).toBe(0)
  })

  it('does not muddle its old position with the Track that now holds it', async () => {
    const site = servingItsOwnApi()
    const home = await withADeparture(site, 'jukebox-show-position-')

    const { tracks, removed } = shown(await showing(site, home, ID))

    // Both rows say position 0: Blue Dot was there and Long Way Down is there
    // now. They are in two lists rather than one for exactly this reason -- one
    // list ordered by position would print two Tracks as the first and claim
    // both were in the Playlist.
    expect(tracks[0]!.position).toBe(0)
    expect(removed[0]!.position).toBe(0)
  })
})

describe('naming the Playlist to show', () => {
  it('takes the id that list prints', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-by-id-')

    expect(shown(await showing(site, home, ID)).playlist.id).toBe(ID)
  })

  it('takes the address it was added with', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-by-url-')

    // Both are things a user has in front of them, and matching the stored URL
    // is how the CLI accepts one without recognising it -- recognising a URL is
    // the worker's job.
    expect(shown(await showing(site, home, URL)).playlist.id).toBe(ID)
  })

  it('refuses one the Mirror does not hold, with its own code', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-unknown-')

    const run = await showing(site, home, 'spotify:nothing-like-it')

    // The CLI's own code, not the API's `playlist_not_found`: nothing was asked
    // of the server, and this is a fact about this machine.
    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'show',
      error: { code: 'playlist_not_tracked' },
    })
    expect(run.code).toBe(1)
  })

  it('says addresses are matched as they were typed, when one was given', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-near-miss-')

    // The same Playlist, pasted a second time with a tracking parameter on it.
    // Nothing is normalized, so this genuinely misses -- and a miss that looks
    // like an address says why, rather than leaving a reader to conclude the
    // Playlist is not tracked when it is.
    const run = await showing(site, home, `${URL}?si=abc123`, false)

    expect(run.stderr).toContain('exactly as')
    expect(run.stderr).toContain('jukebox list')
    expect(run.stdout).toBe('')
    expect(run.code).toBe(1)
  })
})

describe('a Playlist with no Tracks in it yet', () => {
  it('says so rather than printing an empty table', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-show-pending-')
    site.tracking(URL, { id: ID, status: 'pending' })
    site.holding(ID, 'resolving')
    await adding(site, home)

    const run = await showing(site, home, ID, false)

    expect(run.stdout).toContain('not been read from its source')
    expect(run.stdout).toContain('jukebox sync')
    expect(run.code).toBe(0)
  })
})

describe('a Track its Source described only partly', () => {
  it('marks what is missing rather than inventing a zero for it', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-show-sparse-')
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(
      ID,
      snapshot({
        title: 'Rain / Shine',
        tracks: [track({ album: null, durationMs: null, artists: [] })],
      }),
    )
    await adding(site, home)

    const run = await showing(site, home, ID, false)

    // `0:00` would be a duration nobody downstream could tell from a real one,
    // which is the rule CONTEXT.md states about an absent title.
    expect(run.stdout).not.toContain('0:00')
    expect(run.stdout).toContain('--')
    expect(shown(await showing(site, home, ID)).tracks[0]).toMatchObject({
      album: null,
      durationMs: null,
      artists: [],
    })
  })
})

describe('show with no network', () => {
  it('asks the outside world nothing at all', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-offline-')

    site.forgets()
    const run = await showing(site, home, ID)

    expect(site.asked).toEqual([])
    expect(shown(run).tracks).toHaveLength(2)
  })

  it('answers with nowhere to boot from and no saved document to fall back on', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-nowhere-')

    const run = await jukebox(['show', ID, '--json'], {
      discovery: NO_SITE,
      home,
      prepare: (where) => rmSync(join(where.data, CACHE_FILE)),
    })

    expect(shown(run).tracks).toHaveLength(2)
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('show in JSON mode', () => {
  it('writes one object carrying every column the Mirror holds', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-json-')

    const run = await showing(site, home, ID)

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'show' })
    expect(run.stderr).toBe('')

    // Everything, because there is no second way for a script to read the
    // Mirror. A field left out here is a field nobody can reach without opening
    // the database, which has no stability story at all.
    expect(shown(run).tracks[0]).toEqual({
      trackId: 'spotify:blue-dot',
      title: 'Blue Dot',
      artists: ['Aria Fenn'],
      album: 'Ninety Miles',
      durationMs: 214_000,
      isrc: 'GBSTU0100001',
      coverImageUrl: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
      position: 0,
      addedAt: expect.any(Number),
      removedAt: null,
    })
  })
})

describe('the table a person reads', () => {
  /** One `show` at a terminal of a given width, rendered for a person. */
  const atWidth = (site: Site, home: string, columns: number): Promise<Run> =>
    jukebox(['show', ID], { discovery: site.url, home, columns })

  it('numbers the tracks and names the columns', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-numbered-')

    const run = await atWidth(site, home, 80)

    // A header, because a column that can drop out on a narrow terminal needs
    // to have been named while it was there.
    expect(run.stdout).toMatch(/ {2}# {3}TITLE\s+ARTIST\s+ALBUM\s+TIME/)

    // Counted over what is shown, one upward, rather than the Source's own
    // index -- which has holes in it, because a Skipped entry took position 1
    // and a reader would be left wondering what became of it.
    expect(run.stdout).toMatch(/^ {2}1 {3}Blue Dot/m)
    expect(run.stdout).toMatch(/^ {2}2 {3}Long Way Down/m)
  })

  it('puts a removed marker where a number would be, not in a column of its own', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-marker-')
    site.holding(ID, moved)
    await syncing(site, home)

    const run = await atWidth(site, home, 80)

    // One column, not two. Every present row used to carry a blank cell here
    // purely so this `-` would line up, which indented the whole table six
    // spaces to make room for a marker almost no row has.
    expect(run.stdout).toMatch(/^ {2}- {3}Blue Dot/m)
    expect(run.stdout).toMatch(/^ {2}1 {3}Long Way Down/m)
  })
})

describe('a table wider than the terminal it is drawn on', () => {
  const withADeparture = async (site: Site, name: string): Promise<string> => {
    const home = await tracked(site, name)
    site.holding(ID, moved)
    await syncing(site, home)
    return home
  }

  it('spends the date a Track left before anything a reader came for', async () => {
    const site = servingItsOwnApi()
    const home = await withADeparture(site, 'jukebox-show-narrow-')

    // Eighty is the ordinary terminal, and this table does not fit one: the
    // Removed row runs to eighty-nine. So the date goes -- the heading above
    // those rows has already said they are gone, which makes the exact minute
    // the one thing on the line answering a question nobody asked.
    const run = await jukebox(['show', ID], { discovery: site.url, home, columns: 80 })

    expect(run.stdout).not.toContain('left 20')
    expect(run.stdout).toContain('Long Way Down')
    expect(run.stdout).toContain('Aria Fenn, Kit Marlow')
    expect(run.stdout).toContain('Ninety Miles')

    for (const line of run.stdout.split('\n')) expect(line.length).toBeLessThanOrEqual(80)
  })

  it('gives up the album before it cuts a title', async () => {
    const site = servingItsOwnApi()
    const home = await withADeparture(site, 'jukebox-show-narrower-')

    const run = await jukebox(['show', ID], { discovery: site.url, home, columns: 55 })

    expect(run.stdout).not.toContain('Ninety Miles')
    expect(run.stdout).toContain('Long Way Down')
  })
})

describe('naming a Playlist by what it is called', () => {
  it('finds it by the name the table prints', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-by-title-')

    // The whole of why the id left the table: what a reader has in front of
    // them is now what the next command takes.
    const run = await showing(site, home, 'Rain / Shine', false)

    expect(run.stdout).toContain('"Rain / Shine"')
    expect(run.code).toBe(0)
  })

  it('matches a name however it was typed', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-loose-')

    // Quoted, because the screen prints it quoted and that is what a person
    // copies; cased however they cased it; and padded, because a paste often
    // is. The strictness a URL is matched with protects the Source adapter's
    // boundary, and a title has no such boundary behind it.
    for (const typed of ['"Rain / Shine"', 'rain / shine', '  RAIN / SHINE  ']) {
      expect((await showing(site, home, typed, false)).code).toBe(0)
    }
  })

  it('still answers to its id', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-show-still-id-')

    // The id is gone from the screen, not from the interface. A script holding
    // one from `--json` goes on working, and it is the handle the menu passes.
    expect((await showing(site, home, ID, false)).code).toBe(0)
  })
})
