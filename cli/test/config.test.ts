import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERVAL_HOURS,
  INTERVAL_VARIABLE,
  LIBRARY_VARIABLE,
  resolved,
  type FileState,
} from '../src/config'
import { HOME_VARIABLE, type Host } from '../src/paths'

/**
 * A pure seam, called directly.
 *
 * `resolved` is handed a Host and the file's state rather than reading either,
 * for the reason `locations` is: the answer for one platform has to be checkable
 * from another, and Windows is this project's primary environment while CI's is
 * Linux. It also means every awkward file -- one that will not parse, one
 * carrying a value of the wrong type -- is reachable without writing one.
 */

const windows: Host = {
  platform: 'win32',
  env: {
    APPDATA: 'C:\\Users\\ada\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local',
  },
  home: 'C:\\Users\\ada',
}

const linux: Host = { platform: 'linux', env: {}, home: '/home/ada' }

const absent: FileState = { kind: 'absent' }

const holding = (values: Record<string, unknown>): FileState => ({ kind: 'read', values })

const withEnv = (host: Host, env: Record<string, string | undefined>): Host => ({
  ...host,
  env: { ...host.env, ...env },
})

describe('a configuration nobody has touched', () => {
  it('is the platform default for both keys, and says so', () => {
    const { settings, problems } = resolved(linux, absent)

    expect(settings.library_path).toEqual({
      value: '/home/ada/Music/Jukebox',
      origin: 'default',
    })
    expect(settings.sync_interval_hours).toEqual({
      value: DEFAULT_INTERVAL_HOURS,
      origin: 'default',
    })
    expect(problems).toEqual([])
  })

  it('defaults the Library under the music directory on Windows too', () => {
    expect(resolved(windows, absent).settings.library_path.value).toBe(
      'C:\\Users\\ada\\Music\\Jukebox',
    )
  })

  it('is not a problem. An absent file is the ordinary case', () => {
    // Every first run is this one, and there is deliberately no prompt to make
    // it stop being this one.
    expect(resolved(linux, absent).problems).toEqual([])
  })

  it('treats a file with neither key in it the same way', () => {
    const { settings, problems } = resolved(linux, holding({}))

    expect(settings.library_path.origin).toBe('default')
    expect(settings.sync_interval_hours.origin).toBe('default')
    expect(problems).toEqual([])
  })
})

describe('a configuration the file sets', () => {
  it('takes both values and marks where they came from', () => {
    const { settings, problems } = resolved(
      linux,
      holding({ library_path: '/srv/music', sync_interval_hours: 6 }),
    )

    expect(settings.library_path).toEqual({ value: '/srv/music', origin: 'file' })
    expect(settings.sync_interval_hours).toEqual({ value: 6, origin: 'file' })
    expect(problems).toEqual([])
  })

  it('takes one without needing the other', () => {
    const { settings } = resolved(linux, holding({ library_path: '/srv/music' }))

    expect(settings.library_path.origin).toBe('file')
    expect(settings.sync_interval_hours.origin).toBe('default')
  })
})

describe('a configuration the environment sets', () => {
  it('wins over the file, and over the default', () => {
    const host = withEnv(linux, {
      [LIBRARY_VARIABLE]: '/mnt/elsewhere',
      [INTERVAL_VARIABLE]: '12',
    })

    const { settings, problems } = resolved(
      host,
      holding({ library_path: '/srv/music', sync_interval_hours: 6 }),
    )

    expect(settings.library_path).toEqual({ value: '/mnt/elsewhere', origin: 'environment' })
    expect(settings.sync_interval_hours).toEqual({ value: 12, origin: 'environment' })
    expect(problems).toEqual([])
  })

  it('is ignored when empty, rather than read as a value', () => {
    // The rule JUKEBOX_HOME and JUKEBOX_API both follow. A blank value should
    // not quietly mean a Library at the filesystem root.
    const host = withEnv(linux, { [LIBRARY_VARIABLE]: '', [INTERVAL_VARIABLE]: '' })

    const { settings, problems } = resolved(host, holding({ library_path: '/srv/music' }))

    expect(settings.library_path).toEqual({ value: '/srv/music', origin: 'file' })
    expect(settings.sync_interval_hours.origin).toBe('default')
    expect(problems).toEqual([])
  })

  it('is not reached by JUKEBOX_HOME', () => {
    // Relocating everything of ours does not relocate the user's music.
    const host = withEnv(linux, { [HOME_VARIABLE]: '/tmp/scratch' })

    expect(resolved(host, absent).settings.library_path.value).toBe('/home/ada/Music/Jukebox')
  })
})

describe('a file that will not parse', () => {
  const broken: FileState = { kind: 'unreadable', because: "Expected '=' after a key" }

  it('falls back to every default rather than to nothing', () => {
    const { settings } = resolved(linux, broken)

    expect(settings.library_path.origin).toBe('default')
    expect(settings.sync_interval_hours.origin).toBe('default')
  })

  it('is reported rather than passed over in silence', () => {
    // The opposite of what `cache.ts` does with a saved document it cannot
    // read. That file is written by a machine and worth nothing once refetched;
    // this one is hand-written, and silently ignoring it is how somebody's
    // `library_path` stops taking effect with nothing said.
    const { problems } = resolved(linux, broken)

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("Expected '=' after a key")
  })

  it('still lets the environment through', () => {
    const host = withEnv(linux, { [LIBRARY_VARIABLE]: '/mnt/elsewhere' })
    const { settings, problems } = resolved(host, broken)

    expect(settings.library_path).toEqual({ value: '/mnt/elsewhere', origin: 'environment' })
    expect(problems).toHaveLength(1)
  })
})

describe('a value the file gets wrong', () => {
  const ignored = (values: Record<string, unknown>) => {
    const { settings, problems } = resolved(linux, holding(values))
    return { settings, problems }
  }

  it('refuses a Library path that is not text', () => {
    const { settings, problems } = ignored({ library_path: 42 })

    expect(settings.library_path.origin).toBe('default')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('library_path')
  })

  it('refuses a Library path of nothing but spaces', () => {
    const { settings, problems } = ignored({ library_path: '   ' })

    expect(settings.library_path.origin).toBe('default')
    expect(problems).toHaveLength(1)
  })

  it('refuses an interval that is not a number', () => {
    const { settings, problems } = ignored({ sync_interval_hours: 'daily' })

    expect(settings.sync_interval_hours.origin).toBe('default')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('sync_interval_hours')
  })

  it('refuses an interval of zero or less', () => {
    for (const value of [0, -1]) {
      const { settings, problems } = ignored({ sync_interval_hours: value })

      expect(settings.sync_interval_hours.origin).toBe('default')
      expect(problems).toHaveLength(1)
    }
  })

  it('refuses a fractional interval', () => {
    const { settings, problems } = ignored({ sync_interval_hours: 1.5 })

    expect(settings.sync_interval_hours.origin).toBe('default')
    expect(problems).toHaveLength(1)
  })

  it("refuses TOML's own infinity and not-a-number", () => {
    // `inf` and `nan` are both real TOML, and `Bun.TOML.parse` hands each over
    // as `null`. They arrive as a value of the wrong type rather than as a
    // strange number, which is why the guard checks the type before the range.
    //
    // Only `null` is exercised here. `undefined` is what an *absent* key looks
    // like, so passing it would test the wrong branch entirely -- it never
    // reaches the type check -- and an earlier version of this test did exactly
    // that and passed for the wrong reason.
    const { settings, problems } = ignored({ sync_interval_hours: null })

    expect(settings.sync_interval_hours.origin).toBe('default')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('sync_interval_hours')
  })

  it('keeps the key it could read when the other is wrong', () => {
    const { settings, problems } = ignored({ library_path: '/srv/music', sync_interval_hours: 0 })

    expect(settings.library_path).toEqual({ value: '/srv/music', origin: 'file' })
    expect(settings.sync_interval_hours.origin).toBe('default')
    expect(problems).toHaveLength(1)
  })

  it('names a setting it does not know, rather than passing over a typo', () => {
    // The failure this catches is somebody writing `libary_path`, finding their
    // Library unchanged, and having nothing at all to go on.
    const { problems } = ignored({ libary_path: '/srv/music' })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('libary_path')
  })
})

describe('an interval the environment gets wrong', () => {
  const badly = (value: string) => resolved(withEnv(linux, { [INTERVAL_VARIABLE]: value }), absent)

  it('is refused the same way the file is', () => {
    for (const value of ['soon', '0', '-4', '1.5']) {
      const { settings, problems } = badly(value)

      expect(settings.sync_interval_hours.origin).toBe('default')
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain(INTERVAL_VARIABLE)
    }
  })

  it('accepts one written plainly', () => {
    expect(badly('8').settings.sync_interval_hours).toEqual({ value: 8, origin: 'environment' })
  })
})

describe('an unusable value with a usable one beneath it', () => {
  const host = withEnv(linux, { [INTERVAL_VARIABLE]: 'soon' })
  const overFile = () => resolved(host, holding({ sync_interval_hours: 6 }))

  it('falls through to the file rather than past it to the default', () => {
    // Somebody who mistyped a variable still meant what their file says.
    // Discarding that too would compound one mistake into two.
    expect(overFile().settings.sync_interval_hours).toEqual({ value: 6, origin: 'file' })
  })

  it('says what was ignored without claiming what replaced it', () => {
    // The regression this exists for: the problem used to end "so the default is
    // being used instead" while the table above it read `6 (file)`. A command
    // whose whole purpose is saying where a value came from cannot contradict
    // itself about where a value came from.
    const [problem] = overFile().problems

    expect(problem).toContain(INTERVAL_VARIABLE)
    expect(problem).toContain('ignored')
    expect(problem).not.toContain('default')
  })

  it('reports exactly one problem, for the one thing that was wrong', () => {
    expect(overFile().problems).toHaveLength(1)
  })
})
