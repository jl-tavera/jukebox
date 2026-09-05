import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import type { Opened } from '../src/commands/open'
import { LIBRARY_VARIABLE } from '../src/config'
import { jukebox, oneObject, removeHomes, temporaryHome, type Run } from './harness'
import { servingItsOwnApi, snapshot, stopServing, track, type Site } from './server'

/**
 * Seam 3, pointed at the one command that reaches outside the process.
 *
 * Nothing here launches anything. The harness installs a recorder as the opener
 * on every run unless a test says otherwise, so `Run.opened` is the command line
 * this run *would* have handed over -- which is the whole of the decision, since
 * `handing` is three lines over the pure `handedTo` that `opening.test.ts`
 * checks on every platform.
 *
 * The audio is real, though. A file is written into a Library of this run's own
 * and `JUKEBOX_LIBRARY` points at it, because the thing worth protecting is the
 * join from three separate answers -- the configured root, the folder name the
 * Mirror holds, and a name in that directory -- and a fake filesystem would
 * check the parts and not the join.
 */

afterAll(removeHomes)
afterAll(stopServing)

const URL = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

const OTHER_URL = 'https://open.spotify.com/playlist/1zzzzzzzzzzzzzzzzzzzzz'
const OTHER_ID = 'spotify:1zzzzzzzzzzzzzzzzzzzzz'

const BRIEF = { windowMs: 100, intervalMs: 10 }

/** The folder `Rain / Shine` sanitizes to, per ADR-0004: the slash goes. */
const FOLDER = 'Rain Shine'

/** Blue Dot at one, Long Way Down at two -- the numbers `show` prints. */
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

/** Blue Dot has left, so Long Way Down is the only Track still numbered. */
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

/** A Library of this run's own, and the files a test wants sitting in it. */
const library = (name: string, folder: string | null, files: string[] = []): string => {
  const root = temporaryHome(`jukebox-library-${name}-`)

  if (folder !== null) {
    mkdirSync(join(root, folder), { recursive: true })
    for (const file of files) writeFileSync(join(root, folder, file), 'not really audio\n')
  }

  return root
}

/** One `open`, against a home and a Library. */
const opening = (home: string, root: string, argv: string[]): Promise<Run> =>
  jukebox(['open', ...argv, '--json'], {
    home,
    discovery: 'http://127.0.0.1:1/discovery.json',
    env: { [LIBRARY_VARIABLE]: root },
  })

/** A home holding `Rain / Shine` and its two Tracks. */
const tracked = async (site: Site, name: string): Promise<string> => {
  const home = temporaryHome(name)
  site.tracking(URL, { id: ID, status: 'ok' })
  site.holding(ID, twoTracks)
  await jukebox(['add', URL, '--json'], { discovery: site.url, patience: BRIEF, home })
  return home
}

const failure = (run: Run) => oneObject(run).error as { code: string; message: string }

describe('a Track whose audio is there', () => {
  it('is handed to the machine, by the number `show` printed beside it', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-')
    const root = library('found', FOLDER, ['01 - Blue Dot.mp3', '02 - Long Way Down.mp3'])

    const run = await opening(home, root, [ID, '2'])

    expect(run.code).toBe(0)

    // Two is Long Way Down because two is what `show` prints beside it, and the
    // point of the number is that those are the same two. The `#` column counts
    // the Tracks a Playlist still holds, one upward -- it is not `position`,
    // which is 2 here only because the Source offered an entry between them that
    // was Skipped.
    const opened = oneObject(run).data as Opened
    expect(opened.track.title).toBe('Long Way Down')
    expect(opened.at).toBe(2)
    expect(opened.path).toBe(join(root, FOLDER, '02 - Long Way Down.mp3'))

    // And it was actually handed over, once, with the path whole and last.
    expect(run.opened).toHaveLength(1)
    expect(run.opened[0]!.at(-1)).toBe(opened.path)
  })

  it('finds a file somebody named themselves, with no number in front of it', async () => {
    // The case that matters in this release: nothing downloads, so every file
    // that exists was put there by hand. A search that computed a filename would
    // find none of them.
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-byhand-')
    const root = library('byhand', FOLDER, ['Blue Dot.flac'])

    const run = await opening(home, root, [ID, '1'])

    expect(run.code).toBe(0)
    expect((oneObject(run).data as Opened).path).toBe(join(root, FOLDER, 'Blue Dot.flac'))
  })

  it('opens it in JSON mode too, and still writes exactly one object', async () => {
    // `render` decides how an answer is written and never whether the command
    // did what it was asked. `remove` deletes in a pipe; this opens in one.
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-json-')
    const root = library('json', FOLDER, ['01 - Blue Dot.mp3'])

    const run = await opening(home, root, [ID, '1'])

    expect(run.opened).toHaveLength(1)
    expect(() => oneObject(run)).not.toThrow()
  })

  it('is reached by the Playlist’s name as readily as by its id', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-named-')
    const root = library('named', FOLDER, ['01 - Blue Dot.mp3'])

    const run = await opening(home, root, ['Rain / Shine', '1'])

    expect(run.code).toBe(0)
    expect(run.opened).toHaveLength(1)
  })
})

describe('a Track whose audio is not there', () => {
  it('says so, says where it looked, and says why the folder is empty', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-missing-')
    const root = library('missing', FOLDER)

    const run = await opening(home, root, [ID, '1'])

    const { code, message } = failure(run)
    expect(code).toBe('track_file_missing')
    expect(message).toContain('Blue Dot')
    expect(message).toContain(join(root, FOLDER))

    // The honest half. Nothing downloads in this release, so a reader who is not
    // told that concludes a download failed.
    expect(message).toContain('downloads nothing in this release')

    expect(run.code).toBe(1)
    expect(run.opened).toEqual([])
  })

  it('answers the same way when the Library was never created at all', async () => {
    // Which is every machine in this release, because nothing makes the folder.
    // A read that fails and a folder with nothing in it are the same fact to the
    // person asking, so they get the same sentence rather than an `ENOENT`.
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-noroot-')

    const run = await opening(home, join(temporaryHome('jukebox-gone-'), 'nowhere'), [ID, '1'])

    expect(failure(run).code).toBe('track_file_missing')
    expect(run.opened).toEqual([])
  })

  it('does not open a file that is not audio, however well its name matches', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-notaudio-')
    const root = library('notaudio', FOLDER, ['Blue Dot.jpg', 'Blue Dot.txt'])

    const run = await opening(home, root, [ID, '1'])

    expect(failure(run).code).toBe('track_file_missing')
    expect(run.opened).toEqual([])
  })

  it('does not open a half-written file', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-part-')
    const root = library('part', FOLDER, ['Blue Dot.mp3.4821.part'])

    const run = await opening(home, root, [ID, '1'])

    expect(failure(run).code).toBe('track_file_missing')
    expect(run.opened).toEqual([])
  })
})

describe('a number that names no Track', () => {
  it('is refused with what the Playlist actually holds', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-toobig-')
    const root = library('toobig', FOLDER, ['01 - Blue Dot.mp3'])

    const run = await opening(home, root, [ID, '99'])

    const { code, message } = failure(run)
    expect(code).toBe('track_not_recorded')
    expect(message).toContain('2 tracks')
    expect(run.opened).toEqual([])
  })

  it('does not reach a Track the Source has stopped listing', async () => {
    // Blue Dot has left. Its row stays -- that is what Removed means -- and
    // `show` prints it under its own heading with a `-` where a number would be.
    // So there is no number that reaches it, and `2` is now past the end.
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-removed-')
    const root = library('removed', FOLDER, ['01 - Blue Dot.mp3', '02 - Long Way Down.mp3'])

    site.holding(ID, moved)
    await jukebox(['sync', '--json'], { discovery: site.url, home })

    // One Track left, and it is the one that stayed.
    const first = await opening(home, root, [ID, '1'])
    expect((oneObject(first).data as Opened).track.title).toBe('Long Way Down')

    // Blue Dot's audio is still sitting in the folder, and no number reaches it.
    const second = await opening(home, root, [ID, '2'])
    expect(failure(second).code).toBe('track_not_recorded')
    expect(second.opened).toEqual([])
  })

  it.each(['0', '-1', '2.5', 'two', '1e1', '01', ''])(
    'refuses `%s` as a track number rather than guessing at it',
    async (raw) => {
      const site = servingItsOwnApi()
      const home = await tracked(site, 'jukebox-open-notanumber-')
      const root = library('notanumber', FOLDER, ['01 - Blue Dot.mp3'])

      const run = await opening(home, root, [ID, raw])

      // `1e1` is the one worth naming: `Number` reads it as 10, so a check for a
      // whole number would accept a string nobody typed.
      expect(failure(run).code).toBe('invalid_usage')
      expect(run.code).toBe(1)
      expect(run.opened).toEqual([])
    },
  )
})

describe('a Playlist the number cannot be about', () => {
  it('is refused before the number is even read', async () => {
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-untracked-')
    const root = library('untracked', FOLDER, ['01 - Blue Dot.mp3'])

    const run = await opening(home, root, ['spotify:nothing-here', '1'])

    expect(failure(run).code).toBe('playlist_not_tracked')
    expect(run.opened).toEqual([])
  })

  it('is refused rather than resolved when two Playlists share a name', async () => {
    // `show` refuses this and says why. Starting a program on a guess is a step
    // further from harmless than printing one, so this refuses it too.
    const site = servingItsOwnApi()
    const home = await tracked(site, 'jukebox-open-ambiguous-')
    const root = library('ambiguous', FOLDER, ['01 - Blue Dot.mp3'])

    site.tracking(OTHER_URL, { id: OTHER_ID, status: 'ok' })
    site.holding(OTHER_ID, twoTracks)
    await jukebox(['add', OTHER_URL, '--json'], { discovery: site.url, patience: BRIEF, home })

    const run = await opening(home, root, ['Rain / Shine', '1'])

    const { code, message } = failure(run)
    expect(code).toBe('playlist_ambiguous')
    expect(message).toContain(ID)
    expect(message).toContain(OTHER_ID)
    expect(run.opened).toEqual([])
  })
})
