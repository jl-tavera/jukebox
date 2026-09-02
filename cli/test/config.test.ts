import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../package.json'
import {
  CONFIG_FILE,
  DEFAULT_INTERVAL_HOURS,
  INTERVAL_VARIABLE,
  LIBRARY_VARIABLE,
  NOTE,
  configuration,
  planned,
  resolved,
  understood,
  type Configured,
  type FileState,
  type SettingKey,
  type Wrote,
} from '../src/config'
import { HOME_VARIABLE, type Host, type Locations } from '../src/paths'
import { jukebox, oneObject, removeHomes, temporaryHome } from './harness'

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

/**
 * The text is the writer's business and never the resolver's, so it defaults to
 * nothing and the tests above leave it there. A rewrite is the only thing that
 * cares what the lines looked like, and only to say whether it lost a comment.
 */
const holding = (values: Record<string, unknown>, text = ''): FileState => ({
  kind: 'read',
  text,
  values,
})

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
 * The writer, at the same pure seam and for the same reasons.
 *
 * `understood` and `planned` between them decide everything a write does, and
 * neither touches a disk -- so a Windows path is checkable from Linux CI, and a
 * file holding a value nothing can spell is reachable without writing one.
 */

describe('a value typed at a shell', () => {
  it('reads a Windows path as itself, backslashes and all', () => {
    expect(understood('library_path', 'C:\\Music\\Jukebox')).toEqual({
      ok: true,
      value: 'C:\\Music\\Jukebox',
    })
  })

  it('trims it, exactly as a value in the file is trimmed', () => {
    expect(understood('library_path', '  /srv/music  ')).toEqual({
      ok: true,
      value: '/srv/music',
    })
  })

  it('refuses one that is nothing but spaces', () => {
    expect(understood('library_path', '   ').ok).toBe(false)
  })

  it('refuses a control character, the one thing TOML cannot spell', () => {
    // A literal string forbids them outright, and `JSON.stringify` leaves
    // `U+007F` raw -- so the basic-string fallback cannot be trusted with one
    // either, and the file would come back unparseable. Refused before it is
    // written rather than discovered on the next read.
    expect(understood('library_path', `a${String.fromCharCode(0x7f)}b`).ok).toBe(false)
  })

  it('reads an interval written plainly', () => {
    expect(understood('sync_interval_hours', '6')).toEqual({ ok: true, value: 6 })
  })

  it('refuses one too large to write down exactly', () => {
    // `Number.isInteger` is happy with `1e21`, whose `String` is `1e+21`, which
    // TOML reads back as a float. A setting that changed type on its way through
    // the file is the kind of thing nobody would ever think to look for.
    expect(understood('sync_interval_hours', '1e21').ok).toBe(false)
  })

  it('refuses exactly what the file would have ignored', () => {
    // The drift this guards, asserted from both sides at once. A value the writer
    // accepted and the resolver then ignored would mean `config <key> <value>`
    // reporting success and the very next `config` reporting a problem about it.
    for (const typed of ['daily', '0', '-4', '1.5', '']) {
      expect(understood('sync_interval_hours', typed).ok).toBe(false)
      expect(resolved(linux, holding({ sync_interval_hours: typed })).problems).toHaveLength(1)
    }
  })
})

/**
 * A plan that worked, or a failure naming why it did not.
 *
 * Narrowing here rather than in each test, because `Plan` is a union and every
 * assertion below is about the half of it that succeeded -- eight copies of the
 * same guard would be eight chances to write one that passes on a refusal.
 */
const plan = (state: FileState, key: SettingKey, value: string | number, host: Host = linux) => {
  const planning = planned(host, state, key, value)
  if (!planning.ok) throw new Error(`expected a plan, got ${planning.why}: ${planning.because}`)

  return planning
}

/** What the file would say afterwards, read the way the CLI reads it. */
const reread = (text: string) => Bun.TOML.parse(text) as Record<string, unknown>

describe('planning a write', () => {

  it('turns an absent file into one holding the setting', () => {
    const { text } = plan(absent, 'sync_interval_hours', 6)

    expect(reread(text)).toEqual({ sync_interval_hours: 6 })
  })

  it('spells a Windows path with no escaping, and reads it back whole', () => {
    // The reason the file is TOML at all, and the one property a hand-rolled
    // serialiser is most likely to lose.
    const { text, line } = plan(absent, 'library_path', 'C:\\Users\\ada\\Music\\Jukebox')

    expect(line).toBe("library_path = 'C:\\Users\\ada\\Music\\Jukebox'")
    expect(reread(text)['library_path']).toBe('C:\\Users\\ada\\Music\\Jukebox')
  })

  it('falls back to a quoted string for a path holding the quote that would end it', () => {
    const value = "/home/ada's music"
    const { text } = plan(absent, 'library_path', value)

    expect(reread(text)['library_path']).toBe(value)
  })

  it('keeps the setting it was not asked about', () => {
    const state = holding({ library_path: '/srv/music' })
    const { text } = plan(state, 'sync_interval_hours', 6)

    expect(reread(text)).toEqual({ library_path: '/srv/music', sync_interval_hours: 6 })
  })

  it('never writes a default down', () => {
    // A default in the file is a value the user never chose being reported as
    // `(file)` forever after -- and the defaults are machine-dependent, so this
    // machine's answer written into a file makes the file wrong on the next one.
    const { text } = plan(absent, 'sync_interval_hours', 6)

    expect(text).not.toContain('library_path')
  })

  it('reports the setting as coming from the file afterwards', () => {
    expect(plan(absent, 'library_path', '/srv/music').effective).toEqual({
      value: '/srv/music',
      origin: 'file',
    })
  })
})

describe('a write the environment will shadow', () => {
  const host = withEnv(linux, { [LIBRARY_VARIABLE]: '/mnt/elsewhere' })
  const shadowed = () => plan(absent, 'library_path', '/srv/music', host)

  it('still writes, and says the variable is what will be used', () => {
    // The write worked and changed nothing anybody can see. Unsaid, that is
    // indistinguishable from a silent failure.
    const { effective, warnings } = shadowed()

    expect(effective).toEqual({ value: '/mnt/elsewhere', origin: 'environment' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(LIBRARY_VARIABLE)
  })

  it('does not also warn that the Library moved, because it did not', () => {
    // The two warnings are mutually exclusive by construction rather than by a
    // special case: the move warning asks whether the resolved value changed, and
    // a shadowed write does not change it.
    expect(shadowed().warnings.join('\n')).not.toContain('stays there')
  })
})

describe('a Library path that moves', () => {
  const moving = (state: FileState, to: string) =>
    plan(state, 'library_path', to).warnings.filter((warning) => warning.includes('stays there'))

  it('warns, naming the folder the audio is still in', () => {
    // Measured against what the setting resolved to, not against what the file
    // said -- so setting a path for the first time is still a move away from the
    // platform default, which is where anything downloaded would have gone.
    const [warning] = moving(absent, '/srv/music')

    expect(warning).toContain('/home/ada/Music/Jukebox')
  })

  it('says nothing when the value does not actually change', () => {
    expect(moving(holding({ library_path: '/srv/music' }), '/srv/music')).toEqual([])
  })

  it('says nothing about the interval, which moves no files', () => {
    expect(plan(absent, 'sync_interval_hours', 6).warnings).toEqual([])
  })
})

describe('a file a rewrite would take something out of', () => {
  /** A file that holds one line and says so, which is what a rewrite is measured against. */
  const wrote = (text: string, values: Record<string, unknown>) =>
    plan(holding(values, text), 'library_path', '/mnt/nas')

  it('will not be rewritten at all when it cannot be read', () => {
    // The line between this and the warnings below is exactly "can Jukebox read
    // it". A parseable file's settings are all known, so a rewrite loses
    // annotations and keeps every setting; an unparseable file's contents are
    // opaque, so a rewrite is unbounded destruction of something hand-written.
    const broken: FileState = { kind: 'unreadable', because: "Expected '=' after a key" }
    const planning = planned(linux, broken, 'library_path', '/srv/music')

    expect(planning.ok).toBe(false)
    if (planning.ok) return

    expect(planning.why).toBe('unreadable')
    expect(planning.because).toContain("Expected '=' after a key")
  })

  it('warns that a comment is gone, and takes it out', () => {
    // README teaches a commented file, so this is not a hypothetical: it is what
    // happens to somebody who followed the documentation.
    const held = { library_path: '/srv/music' }
    const { warnings, text } = wrote("# my music lives on the NAS\nlibrary_path = '/srv'\n", held)

    expect(warnings.some((warning) => warning.includes('comments'))).toBe(true)
    expect(text).not.toContain('NAS')
  })

  it('says nothing about a file Jukebox wrote itself', () => {
    // The common case, and the reason this is asked rather than always said: a
    // warning printed on every write is a warning nobody reads by the third one.
    const { warnings } = wrote("library_path = '/srv/music'\n", { library_path: '/srv/music' })

    expect(warnings.some((warning) => warning.includes('comments'))).toBe(false)
  })

  it('names a key it does not know rather than dropping it quietly', () => {
    const { warnings, text } = wrote("libary_path = '/typo'\n", { libary_path: '/typo' })

    expect(warnings.some((warning) => warning.includes('libary_path'))).toBe(true)
    expect(text).not.toContain('libary_path')
  })

  it('keeps a known value it disagrees with, because the user wrote it', () => {
    // Carried forward on whether it can be spelled, not on whether it is valid.
    // Deleting it would silently "fix" somebody's file, and `config` would stop
    // reporting the problem that is the only clue they have.
    const { text, problems } = plan(holding({ library_path: 42 }), 'sync_interval_hours', 6)

    expect(text).toContain('library_path')
    expect(problems).toHaveLength(1)
  })

  it('drops one it cannot write down at all, and says so', () => {
    // TOML's own `nan` arrives from the parser as `null`. There is no spelling of
    // it this writer will emit, so it goes -- which is a loss, so it is said.
    const held = holding({ sync_interval_hours: null })
    const { warnings, text } = plan(held, 'library_path', '/srv')

    expect(warnings.some((warning) => warning.includes('sync_interval_hours'))).toBe(true)
    expect(text).not.toContain('sync_interval_hours')
  })
})

/**
 * The one thing above the pure seam that a Host still reaches.
 *
 * `configuration` reads the real filesystem, but *where* it looks is decided
 * from the Host alone -- so this is the same question `paths.test.ts` asks, and
 * it has to be asked from both sides. The Windows answer is the one that fails
 * on Linux CI; the Linux answer is the one that fails on the Windows machine
 * this was written on. Either alone would pass wherever it ran first, which is
 * how the filename came to be appended in the host's dialect rather than the
 * target's.
 *
 * Only the path is asserted. Every home named here belongs to nobody, so the
 * read behind it finds nothing on any machine, and saying so would tie the test
 * to something it is not about.
 */
describe('where the configuration file is', () => {
  it('spells it the way the platform it is for spells it', () => {
    expect(configuration(windows).file.path).toBe(
      'C:\\Users\\ada\\AppData\\Roaming\\Jukebox\\config.toml',
    )
    expect(configuration(linux).file.path).toBe('/home/ada/.config/jukebox/config.toml')
  })
})

/**
 * Seam 3: the command, driven the way a shell drives it.
 *
 * What the pure tests above cannot reach is the part a user meets -- that a file
 * on disk is actually found, that the note is actually printed, and above all
 * that running this creates nothing it did not say it would.
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

  it('is listed in the help, described as something that shows and sets', async () => {
    const run = await jukebox(['--help'], { discovery: NO_SITE })

    expect(run.stdout).toContain('config')

    // Half of the honesty constraint, and the half that survived #53. Setting the
    // interval is now real; anything acting on it still is not, so a description
    // promising a schedule would be a promise this release does not keep.
    const help = run.stdout.toLowerCase()
    expect(help).not.toContain('schedule')
    expect(run.code).toBe(0)
  })

  it('offers both arguments as optional in its own help', async () => {
    // Square brackets rather than angle ones, which is citty's own spelling of
    // the difference. `jukebox config` on its own has to stay a whole command.
    const run = await jukebox(['config', '--help'], { discovery: NO_SITE })

    expect(run.stdout).toContain('[KEY]')
    expect(run.stdout).toContain('[VALUE]')
    expect(run.code).toBe(0)
  })
})

/** The same command, given something to change. */
const setting = (words: string[], options: Parameters<typeof jukebox>[1] = {}) =>
  jukebox(['config', ...words], { discovery: NO_SITE, ...options })

describe('jukebox config <key> <value>', () => {
  it('writes it, and the next run reads it back out of the file', async () => {
    // Two runs over one home, which is the only way to assert this: every other
    // run starts from an empty directory and could never find what the first
    // one wrote.
    const home = temporaryHome('jukebox-config-set-')

    const wrote = await setting(['sync_interval_hours', '6'], { home })
    expect(wrote.code).toBe(0)

    const read = await setting([], { home, tty: false })
    const { data } = oneObject(read) as { data: Configured }

    expect(data.settings.sync_interval_hours).toEqual({ value: 6, origin: 'file' })
    expect(data.file.state).toBe('read')
  })

  it('puts a Windows path in the file with nothing escaped', async () => {
    // The bytes, not the reported value. TOML's literal string is the reason the
    // file is TOML, and it is the thing a hand-rolled writer loses first.
    const run = await setting(['library_path', 'D:\\Music\\Jukebox'])

    expect(readFileSync(join(run.locations.config, CONFIG_FILE), 'utf8')).toContain(
      "library_path = 'D:\\Music\\Jukebox'",
    )
  })

  it('leaves the file it wrote and nothing else', async () => {
    // No part file, no data directory, and above all no Library folder -- the
    // README promises one is not created "not even by setting it".
    const run = await setting(['library_path', 'D:\\Music\\Jukebox'])

    expect([...new Bun.Glob('**/*').scanSync(run.home)]).toEqual([join('config', CONFIG_FILE)])
  })

  it('answers with no network at all, the way reading does', async () => {
    const run = await setting(['sync_interval_hours', '6'])

    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })

  it('says the environment still wins, when it does', async () => {
    const run = await setting(['library_path', '/srv/music'], {
      env: { [LIBRARY_VARIABLE]: '/mnt/elsewhere' },
    })

    expect(run.stdout).toContain(LIBRARY_VARIABLE)
    expect(run.stdout).toContain('/mnt/elsewhere')
    expect(run.code).toBe(0)
  })

  it('warns the audio stays behind, and still says none has arrived', async () => {
    // Both sentences, together. The warning is the policy; `NOTE` is why the
    // policy costs nothing today. Either one alone reads as a contradiction of
    // the other.
    const run = await setting(['library_path', 'D:\\Music\\Jukebox'])

    expect(run.stdout).toContain('stays there')
    expect(run.stdout).toContain(NOTE)
  })

  it('carries the whole envelope in JSON mode, and nothing beside it', async () => {
    const run = await setting(['sync_interval_hours', '6'], { tty: false })
    const envelope = oneObject(run)

    expect(envelope).toMatchObject({ ok: true, command: 'config', version: pkg.version })

    const { data } = envelope as { data: Wrote }
    expect(data.key).toBe('sync_interval_hours')
    expect(data.effective).toEqual({ value: 6, origin: 'file' })
    expect(data.note).toBe(NOTE)
    expect(run.stderr).toBe('')
  })

  it('is reached the same way wherever the flag was written', async () => {
    // The command tree is still one level deep, and `main` still finds the
    // command by taking the first token that is not a flag. Two positionals were
    // chosen over a `config set` precisely so that stayed true.
    const [before, after] = await Promise.all([
      jukebox(['--json', 'config', 'sync_interval_hours', '6'], { discovery: NO_SITE }),
      jukebox(['config', 'sync_interval_hours', '6', '--json'], { discovery: NO_SITE }),
    ])

    expect(oneObject(before)).toMatchObject({ ok: true, command: 'config' })
    expect(oneObject(after)).toMatchObject({ ok: true, command: 'config' })
  })
})

describe('a change jukebox config will not make', () => {
  /** Refused before anything is written, which is half of what each of these asserts. */
  const refused = async (words: string[], options: Parameters<typeof jukebox>[1] = {}) => {
    const run = await setting(words, { tty: false, ...options })

    expect(oneObject(run)).toMatchObject({ ok: false, command: 'config' })
    expect([...new Bun.Glob('**/*').scanSync(run.home)]).toEqual([])
    expect(run.code).toBe(1)

    return (oneObject(run) as { error: { code: string; message: string } }).error
  }

  it('refuses a setting it does not know, naming the ones it does', async () => {
    const error = await refused(['libary_path', '/srv/music'])

    expect(error.code).toBe('invalid_usage')
    expect(error.message).toContain('libary_path')
    expect(error.message).toContain('library_path')
    expect(error.message).toContain('sync_interval_hours')
  })

  it('refuses a value that will not parse, and says why', async () => {
    // Refused rather than written for the next command to complain about, which
    // is the difference between one confusing run and every run after it.
    const error = await refused(['sync_interval_hours', 'daily'])

    expect(error.code).toBe('invalid_usage')
    expect(error.message).toContain('whole number of hours')
  })

  it('refuses a key with no value, naming both shapes', async () => {
    const error = await refused(['library_path'])

    expect(error.code).toBe('invalid_usage')
    expect(error.message).toContain('jukebox config library_path <value>')
  })

  it('refuses more words than it takes, rather than writing a truncated one', async () => {
    // citty fills the two positionals it knows about and drops the rest without a
    // word, so an unquoted path with a space in it would otherwise be written as
    // `C:\My` and reported as a success. The worst failure available here.
    const error = await refused(['library_path', 'C:\\My', 'Music\\Jukebox'])

    expect(error.code).toBe('invalid_usage')
    expect(error.message).toContain('Quote the value')
  })

  it('refuses to rewrite a file it could not read, and leaves it exactly as it was', async () => {
    const broken = 'this is not toml {{{\n'
    const run = await setting(['sync_interval_hours', '6'], {
      tty: false,
      prepare: writing(broken),
    })

    expect(oneObject(run)).toMatchObject({
      ok: false,
      error: { code: 'config_unwritable' },
    })
    expect(run.code).toBe(1)

    // The whole point of refusing. Rewriting would have replaced hand-written
    // text that nothing can recover with two lines Jukebox chose.
    expect(readFileSync(join(run.locations.config, CONFIG_FILE), 'utf8')).toBe(broken)
    expect([...new Bun.Glob('**/*').scanSync(run.home)]).toEqual([join('config', CONFIG_FILE)])
  })

  it('reports a write the filesystem refused, rather than swallowing it', async () => {
    // The inversion this ticket asked for. `cache.ts` shares this write and
    // swallows every failure, because it writes for the next run; a `set` that
    // did the same would tell somebody their setting was saved.
    //
    // A plain file where the configuration directory goes, so creating it cannot
    // work. The read path is unaffected: it already treats a parent that is not a
    // directory as no file at all.
    const run = await setting(['sync_interval_hours', '6'], {
      tty: false,
      prepare: (where) => writeFileSync(where.config, 'not a directory\n'),
    })

    const { error } = oneObject(run) as { error: { code: string; message: string } }

    expect(error.code).toBe('config_unwritable')
    expect(error.message).toContain('left as it was')
    expect(run.code).toBe(1)
  })
})
