import { describe, expect, it } from 'bun:test'
import { HOME_VARIABLE, locations, type Host } from '../src/paths'

/**
 * A pure seam, called directly.
 *
 * Every platform's answer is checked from whichever platform is running the
 * tests, which is the whole reason `locations` is handed a Host rather than
 * reading one. Windows is the developer's machine and Linux is CI's, so
 * without this each would only ever check its own.
 */

const windows: Host = {
  platform: 'win32',
  env: {
    APPDATA: 'C:\\Users\\ada\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local',
  },
  home: 'C:\\Users\\ada',
}

const macos: Host = { platform: 'darwin', env: {}, home: '/Users/ada' }

const linux: Host = { platform: 'linux', env: {}, home: '/home/ada' }

describe('where the CLI keeps things', () => {
  it('separates configuration from the Mirror on every platform', () => {
    for (const host of [windows, macos, linux]) {
      const { config, data } = locations(host)

      // Different lifetimes and different backup stories, per spec #29. One
      // directory holding both would be a decision nobody could undo later
      // without moving everyone's Mirror.
      expect(config).not.toBe(data)
    }
  })

  it('follows Windows conventions', () => {
    expect(locations(windows)).toEqual({
      config: 'C:\\Users\\ada\\AppData\\Roaming\\Jukebox',
      data: 'C:\\Users\\ada\\AppData\\Local\\Jukebox',
    })
  })

  it('falls back to the profile when Windows names neither directory', () => {
    // A stripped environment -- a service account, a scheduled task, a shell
    // that cleared it -- still has a home, and guessing from it beats writing
    // to the drive root or refusing to boot.
    const { config, data } = locations({ ...windows, env: {} })

    expect(config).toBe('C:\\Users\\ada\\AppData\\Roaming\\Jukebox')
    expect(data).toBe('C:\\Users\\ada\\AppData\\Local\\Jukebox')
  })

  it('follows macOS conventions', () => {
    expect(locations(macos)).toEqual({
      config: '/Users/ada/Library/Preferences/Jukebox',
      data: '/Users/ada/Library/Application Support/Jukebox',
    })
  })

  it('follows the XDG base directory spec on Linux', () => {
    expect(locations(linux)).toEqual({
      config: '/home/ada/.config/jukebox',
      data: '/home/ada/.local/share/jukebox',
    })
  })

  it('honours the XDG variables when Linux sets them', () => {
    const { config, data } = locations({
      ...linux,
      env: { XDG_CONFIG_HOME: '/etc/xdg', XDG_DATA_HOME: '/srv/data' },
    })

    expect(config).toBe('/etc/xdg/jukebox')
    expect(data).toBe('/srv/data/jukebox')
  })

  it('spells a path the way the platform it is for spells it', () => {
    // Resolved for a platform, not on one. A Windows path built with forward
    // slashes would still open on Windows and would still be wrong in every
    // message that printed it.
    expect(locations(windows).config).toContain('\\')
    expect(locations(linux).config).not.toContain('\\')
  })
})

describe(HOME_VARIABLE, () => {
  it('relocates both directories at once', () => {
    // One variable, because the point is that a test or a curious user moves
    // everything with a single thing to remember -- and because two variables
    // can be set inconsistently and this cannot.
    const { config, data } = locations({ ...linux, env: { [HOME_VARIABLE]: '/tmp/somewhere' } })

    expect(config).toBe('/tmp/somewhere/config')
    expect(data).toBe('/tmp/somewhere/data')
  })

  it('relocates them on Windows too', () => {
    const { config, data } = locations({ ...windows, env: { [HOME_VARIABLE]: 'D:\\scratch' } })

    expect(config).toBe('D:\\scratch\\config')
    expect(data).toBe('D:\\scratch\\data')
  })

  it('ignores an empty value rather than moving everything to the root', () => {
    expect(locations({ ...linux, env: { [HOME_VARIABLE]: '' } })).toEqual(locations(linux))
  })

  it('ignores one that is nothing but whitespace, for the same reason', () => {
    // A single space is what an empty value looks like after a shell has been
    // careless with it, and `' '` is a perfectly legal directory name on Linux
    // -- so reading it as one would put the Mirror somewhere nobody can find.
    expect(locations({ ...linux, env: { [HOME_VARIABLE]: '  ' } })).toEqual(locations(linux))
  })
})

describe('every variable that names a directory', () => {
  it('treats blank and whitespace alike, wherever it is read', () => {
    // One rule, written once in `given` and applied at every site. It had been
    // written several times over and they had drifted: `||` lets a single space
    // through as a path, and a bare read lets an empty string through.
    for (const blank of ['', '   ']) {
      expect(locations({ ...linux, env: { XDG_CONFIG_HOME: blank } }).config).toBe(
        '/home/ada/.config/jukebox',
      )
      expect(locations({ ...linux, env: { XDG_DATA_HOME: blank } }).data).toBe(
        '/home/ada/.local/share/jukebox',
      )
      expect(locations({ ...windows, env: { APPDATA: blank } }).config).toBe(
        'C:\\Users\\ada\\AppData\\Roaming\\Jukebox',
      )
    }
  })
})
