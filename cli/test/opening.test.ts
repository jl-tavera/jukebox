import { describe, expect, it } from 'bun:test'
import { fileNamed, folderOf, handedTo } from '../src/opening'
import type { Host } from '../src/paths'

/**
 * A pure seam, called directly, for `paths.test.ts`'s reason: every platform's
 * answer is checked from whichever platform is running the tests.
 *
 * It matters more here than it does there. The Windows command line below is the
 * one a developer on Windows would get right by accident and a CI box on Linux
 * would never run at all, and the argument for it -- that a filename holding `&`
 * must not reach a shell -- is only checkable if the vector can be built
 * anywhere.
 *
 * `handing`, the half that spawns, is not tested here and is not tested
 * anywhere: it is three lines over `handedTo`, and a test for it would be a test
 * that launches an application on whoever ran it. What a run *would* have handed
 * over is asserted at Seam 3 instead, through the recorder the harness installs
 * by default.
 */

const windows: Host = { platform: 'win32', env: {}, home: 'C:\\Users\\ada' }
const macos: Host = { platform: 'darwin', env: {}, home: '/Users/ada' }
const linux: Host = { platform: 'linux', env: {}, home: '/home/ada' }

describe('the folder a Playlist\u2019s audio would be in', () => {
  it('is the chosen root and the name the Playlist was given, in the Host\u2019s dialect', () => {
    expect(folderOf(windows, 'C:\\Users\\ada\\Music\\Jukebox', 'Rain Shine')).toBe(
      'C:\\Users\\ada\\Music\\Jukebox\\Rain Shine',
    )
    expect(folderOf(linux, '/home/ada/Music/Jukebox', 'Rain Shine')).toBe(
      '/home/ada/Music/Jukebox/Rain Shine',
    )
  })

  it('is nothing at all for a Playlist that has never resolved', () => {
    // No title yet means no folder name yet, per ADR-0004. An answer rather than
    // a crash: `open` turns it into the same sentence a folder with nothing in
    // it gets, because from the person's side those are the same situation.
    expect(folderOf(linux, '/home/ada/Music/Jukebox', null)).toBeNull()
  })
})

describe('which file in the folder is this Track', () => {
  const entries = ['01 - Long Way Down.mp3', '02 - Shorter.flac', 'cover.jpg', 'playlist.m3u']

  it('finds the one whose name holds the title, whatever else is around it', () => {
    expect(fileNamed('Long Way Down', entries)).toBe('01 - Long Way Down.mp3')
  })

  it('finds one a person named themselves, with no number in front of it', () => {
    // The case that matters in this release, because nothing downloads: every
    // file in the folder was put there by hand. A matcher that computed
    // `{nn} - {title}.{ext}` would find none of these.
    expect(fileNamed('Long Way Down', ['Long Way Down.flac'])).toBe('Long Way Down.flac')
    expect(fileNamed('Long Way Down', ['Long Way Down.mp3'])).toBe('Long Way Down.mp3')
  })

  it('matches a title through the same character pass the filename went through', () => {
    // `Rain / Shine` cannot appear in a filename holding that slash, so a
    // comparison of the raw strings finds nothing. This is the case that made
    // `madeSafe` an export rather than a copy.
    expect(fileNamed('Rain / Shine', ['Rain Shine.mp3'])).toBe('Rain Shine.mp3')
  })

  it('ignores case, because a filesystem may or may not', () => {
    expect(fileNamed('long way DOWN', ['01 - Long Way Down.mp3'])).toBe('01 - Long Way Down.mp3')
  })

  it('prefers a name that is exactly the title over one that merely holds it', () => {
    // Containment alone gets this backwards: a short title is a substring of
    // every longer one, so `Rain` would open `Rain and Shine` on a folder that
    // has both.
    expect(fileNamed('Rain', ['Rain and Shine.mp3', 'Rain.mp3'])).toBe('Rain.mp3')
  })

  it('settles two equally good matches the same way every time', () => {
    const both = ['b - Long Way Down.mp3', 'a - Long Way Down.mp3']

    expect(fileNamed('Long Way Down', both)).toBe('a - Long Way Down.mp3')
    expect(fileNamed('Long Way Down', [...both].reverse())).toBe('a - Long Way Down.mp3')
  })

  it('opens nothing that is not audio, however well its name matches', () => {
    expect(fileNamed('cover', ['cover.jpg'])).toBeNull()
    expect(fileNamed('Long Way Down', ['Long Way Down.txt', 'Long Way Down.m3u'])).toBeNull()
  })

  it('never opens a half-written file', () => {
    // `files.ts` writes through one of these and renames. It is either a write
    // in flight or one that died, and neither is a thing to hand a music player.
    expect(fileNamed('Long Way Down', ['Long Way Down.mp3.4821.part'])).toBeNull()
  })

  it('finds nothing in an empty folder, and nothing for a title made of nothing', () => {
    expect(fileNamed('Long Way Down', [])).toBeNull()

    // Every character forbidden, so nothing could ever have been named after it.
    // Guarded because an empty needle is a substring of every name in the folder
    // and would otherwise open one at random.
    expect(fileNamed('///', ['Long Way Down.mp3'])).toBeNull()
  })
})

describe('handing a file to the operating system', () => {
  it('asks each platform in its own words', () => {
    expect(handedTo(macos, '/Users/ada/Music/x.mp3')).toEqual(['open', '/Users/ada/Music/x.mp3'])
    expect(handedTo(linux, '/home/ada/Music/x.mp3')).toEqual([
      'xdg-open',
      '/home/ada/Music/x.mp3',
    ])
    expect(handedTo(windows, 'C:\\Music\\x.mp3')).toEqual([
      'rundll32.exe',
      'url.dll,FileProtocolHandler',
      'C:\\Music\\x.mp3',
    ])
  })

  it('puts the path last and whole on every platform', () => {
    // What the rest of this file is really about. A path is the one element of
    // the vector that is arbitrary user data, so it must arrive as exactly one
    // argument -- and the reason Windows does not go through `cmd` is that a
    // shell would re-split this one on its own rules and turn a filename into
    // two commands.
    const awkward = 'Bell, Book & Candle > Live "1971".mp3'

    for (const host of [windows, macos, linux]) {
      const argv = handedTo(host, awkward)

      expect(argv.at(-1)).toBe(awkward)
      expect(argv.filter((part) => part.includes('Candle'))).toHaveLength(1)
    }
  })

  it('never asks a shell to do it', () => {
    for (const host of [windows, macos, linux]) {
      expect(handedTo(host, '/x.mp3')[0]).not.toMatch(/^(cmd|sh|bash|powershell|pwsh)/i)
    }
  })
})
