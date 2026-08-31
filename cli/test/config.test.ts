import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../package.json'
import {
  CONFIG_FILE,
  DEFAULT_INTERVAL_HOURS,
  INTERVAL_VARIABLE,
  LIBRARY_VARIABLE,
  NOTE,
  resolved,
  type Configured,
  type FileState,
} from '../src/config'
import { HOME_VARIABLE, type Host, type Locations } from '../src/paths'
import { jukebox, oneObject, removeHomes } from './harness'

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

/**
 * Seam 3: the command, driven the way a shell drives it.
 *
 * What the pure tests above cannot reach is the part a user meets -- that a file
 * on disk is actually found, that the note is actually printed, and above all
 * that running this creates nothing.
 */

afterAll(removeHomes)

const writing = (contents: string) => (where: Locations) => {
  mkdirSync(where.config, { recursive: true })
  writeFileSync(join(where.config, CONFIG_FILE), contents)
}

/**
 * Nowhere. Every run below is given it, so that a command which quietly booted
 * would hang or warn rather than passing.
 */
const NO_SITE = 'http://127.0.0.1:1/discovery.json'

const asking = (options: Parameters<typeof jukebox>[1] = {}) =>
  jukebox(['config'], { discovery: NO_SITE, ...options })

describe('jukebox config', () => {
  it('shows both settings with where each came from', async () => {
    const run = await asking()

    expect(run.stdout).toContain('library_path')
    expect(run.stdout).toContain('sync_interval_hours')
    expect(run.stdout).toContain(String(DEFAULT_INTERVAL_HOURS))
    expect(run.stdout).toContain('(default)')
    expect(run.code).toBe(0)
  })

  it('says plainly that nothing acts on either of them', async () => {
    // The honesty constraint, and the thing most likely to be lost in a later
    // tidy-up of this command's output.
    const run = await asking()

    expect(run.stdout).toContain(NOTE)
  })

  it('names where a configuration file would go, when there is none', async () => {
    const run = await asking()

    expect(run.stdout).toContain(join(run.locations.config, CONFIG_FILE))
    expect(run.stdout.toLowerCase()).toContain('no configuration file yet')
  })

  it('creates nothing at all', async () => {
    const run = await asking()

    // The whole of "no first-run prompt asks for a Library path, and no Library
    // folder is created", asserted the way `cli.test.ts` asserts it of `version`.
    // A configuration directory conjured up for a file nobody wrote would be the
    // same broken promise as the folder.
    expect([...new Bun.Glob('**/*').scanSync(run.home)]).toEqual([])
  })

  it('answers with no network at all', async () => {
    // Pointed at a closed port. A command that booted would warn on stderr at
    // best and stop at worst, so silence here is the evidence that `config`
    // never opens `boot.ts`'s one door.
    const run = await asking()

    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })

  it('names the variable behind a value the environment supplied', async () => {
    // `(environment)` alone leaves a reader who disagrees with the value with
    // nowhere to go: it is not in the file in front of them, and nothing on
    // screen says what to unset.
    const run = await asking({ env: { [LIBRARY_VARIABLE]: '/mnt/elsewhere' } })

    expect(run.stdout).toContain(`(environment: ${LIBRARY_VARIABLE})`)

    // The other two origins name themselves through the key, so they stay bare.
    expect(run.stdout).toContain('(default)')
  })

  it('reads a file somebody wrote', async () => {
    const run = await asking({ tty: false, prepare: writing("library_path = '/srv/music'\n") })

    const { data } = oneObject(run) as { data: Configured }

    expect(data.settings.library_path).toEqual({ value: '/srv/music', origin: 'file' })
    expect(data.file.state).toBe('read')
    expect(data.problems).toEqual([])
  })

  it('lets a variable override the file', async () => {
    const run = await asking({
      tty: false,
      env: { [LIBRARY_VARIABLE]: '/mnt/elsewhere' },
      prepare: writing("library_path = '/srv/music'\n"),
    })

    const { data } = oneObject(run) as { data: Configured }

    expect(data.settings.library_path).toEqual({
      value: '/mnt/elsewhere',
      origin: 'environment',
    })
  })

  it('reports a file it cannot parse, and still answers', async () => {
    const run = await asking({ tty: false, prepare: writing('this is not toml {{{\n') })

    const { data } = oneObject(run) as { data: Configured }

    expect(data.problems).toHaveLength(1)
    expect(data.file.state).toBe('unreadable')
    expect(data.settings.library_path.origin).toBe('default')

    // Reported, and still a command that worked. Exiting non-zero here would
    // make a broken file indistinguishable from a broken Jukebox.
    expect(run.code).toBe(0)
  })

  it('never claims to have read a file it could not read', async () => {
    // The two halves of the output contradicting each other -- `Read from ...`
    // above a problem saying it was not read -- is a small dishonesty, and this
    // command is the one place it is least affordable.
    const run = await asking({ prepare: writing('this is not toml {{{\n') })

    expect(run.stdout).not.toContain('Read from')
    expect(run.stdout).toContain('There is a configuration file at')
    expect(run.stdout).toContain('could not be read')
  })

  it('carries the whole envelope in JSON mode, and nothing beside it', async () => {
    const run = await asking({ tty: false })
    const envelope = oneObject(run)

    expect(envelope).toMatchObject({ ok: true, command: 'config', version: pkg.version })

    const { data } = envelope as { data: Configured }
    expect(data.note).toBe(NOTE)
    expect(data.settings.sync_interval_hours.value).toBe(DEFAULT_INTERVAL_HOURS)
    expect(run.stderr).toBe('')
  })

  it('is listed in the help, described as something that shows', async () => {
    const run = await jukebox(['--help'], { discovery: NO_SITE })

    expect(run.stdout).toContain('config')

    // The other half of the honesty constraint. A description promising to set
    // or schedule anything would be a promise this release does not keep.
    const help = run.stdout.toLowerCase()
    expect(help).not.toContain('schedule')
    expect(run.code).toBe(0)
  })
})
