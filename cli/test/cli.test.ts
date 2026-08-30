import { afterAll, describe, expect, it } from 'bun:test'
import { defineCommand } from 'citty'
import pkg from '../package.json'
import { jukebox, oneObject, removeHomes } from './harness'

afterAll(removeHomes)

describe('jukebox --version', () => {
  it('reports the version and exits zero', async () => {
    const run = await jukebox(['--version'])

    expect(run.stdout.trim()).toBe(pkg.version)
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })

  it('answers the same as the version command', async () => {
    // Two ways of asking one question. A flag that computed its answer
    // separately is a second implementation, and the two drift.
    const [flag, command] = await Promise.all([
      jukebox(['--version', '--json']),
      jukebox(['version', '--json']),
    ])

    expect(oneObject(flag)).toEqual(oneObject(command))
  })

  it('carries the whole envelope in JSON mode', async () => {
    const run = await jukebox(['--version', '--json'])

    expect(oneObject(run)).toEqual({
      ok: true,
      command: 'version',
      version: pkg.version,
      data: { version: pkg.version },
    })

    // Nothing but the object. A note, a warning or a spinner here would break
    // every caller that reads stdout and parses it whole.
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('choosing a rendering', () => {
  it('renders JSON when stdout is not a terminal, with no flag', async () => {
    const run = await jukebox(['version'], { tty: false })

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'version' })
  })

  it('renders for a human at a terminal', async () => {
    const run = await jukebox(['version'])

    // Not JSON: a person at a terminal wanted a version, not a document.
    expect(run.stdout.trim()).toBe(pkg.version)
    expect(() => JSON.parse(run.stdout)).toThrow()
  })

  it('stops reading flags at a bare double dash', async () => {
    // What follows `--` is an argument that happens to look like a flag. The
    // command resolver already stops there, and the two disagreeing is the
    // subtle kind of bug -- a URL carrying `--json` would change how its own
    // command rendered.
    const run = await jukebox(['version', '--', '--json'])

    expect(run.stdout.trim()).toBe(pkg.version)
  })
})

describe('jukebox --help', () => {
  it('lists every command with a one-line description', async () => {
    const run = await jukebox(['--help'])

    expect(run.stdout).toContain('version')
    expect(run.stdout.toLowerCase()).toContain('report the version')
    expect(run.code).toBe(0)
  })

  it('says the JSON shape is unstable before 1.0', async () => {
    // An agent reading this is exactly who would otherwise build on a shape
    // that is going to move. Recorded in docs/adr/0005.
    const run = await jukebox(['--help'])

    expect(run.stdout.toLowerCase()).toContain('unstable')
    expect(run.stdout).toContain('1.0')
  })

  it('says it in JSON mode too', async () => {
    const help = oneObject(await jukebox(['--help', '--json']))

    expect(help).toMatchObject({ ok: true, command: 'help' })

    const data = help.data as { commands: { name: string }[]; jsonStability: string }
    expect(data.commands.map((command) => command.name)).toContain('version')
    expect(data.jsonStability.toLowerCase()).toContain('unstable')
  })
})

describe("a command's own help", () => {
  it('describes that command in both renderings', async () => {
    // Not the root in one mode and the command in the other. Two renderings
    // that answered different questions would make the JSON one useless for
    // finding out what a command takes.
    const help = oneObject(await jukebox(['version', '--help', '--json']))

    expect((help.data as { name: string }).name).toBe('version')

    const human = await jukebox(['version', '--help'])
    expect(human.stdout).toContain('jukebox version')
    expect(human.code).toBe(0)
  })

  it('says the JSON shape is unstable, the same as the root does', async () => {
    // `--json` belongs to the whole program, and a command's own help is at
    // least as likely to be where somebody reads about it.
    const human = await jukebox(['version', '--help'])
    expect(human.stdout.toLowerCase()).toContain('unstable')
    expect(human.stdout).toContain('1.0')

    const help = oneObject(await jukebox(['version', '--help', '--json']))
    expect((help.data as { jsonStability: string }).jsonStability).toContain('1.0')
  })
})

describe('an argument vector that names nothing', () => {
  it('refuses a command that does not exist', async () => {
    const run = await jukebox(['sing', '--json'])

    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'jukebox',
      error: { code: 'invalid_usage' },
    })
    expect(run.code).toBe(1)
  })

  it('names the way out rather than the status code', async () => {
    const run = await jukebox(['sing'])

    // Failures go to stderr, so a human sees the problem and a pipe reading
    // stdout is not handed prose where it expected data.
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('sing')
    expect(run.stderr).toContain('--help')
    expect(run.code).toBe(1)
  })

  it('refuses it even when help was what was asked for', async () => {
    // There is no help for a command that does not exist. Answering with the
    // root's usage and a zero exit would tell a script the typo worked.
    const run = await jukebox(['sing', '--help', '--json'])

    expect(oneObject(run)).toMatchObject({ ok: false, error: { code: 'invalid_usage' } })
    expect(run.code).toBe(1)
  })

  it('refuses a bare invocation', async () => {
    const run = await jukebox([], { tty: false })

    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'jukebox',
      error: { code: 'invalid_usage' },
    })
    expect(run.code).toBe(1)
  })
})

describe('a command that fails in a way nothing planned for', () => {
  const explodes = defineCommand({
    meta: { name: 'jukebox' },
    subCommands: {
      boom: defineCommand({
        meta: { name: 'boom', description: 'Throws' },
        run: () => {
          throw new Error('the disc is scratched')
        },
      }),
    },
  })

  it('still writes exactly one JSON object', async () => {
    const run = await jukebox(['boom', '--json'], { root: explodes })

    // The one thing that must not happen: a stack trace on stdout, which every
    // caller parsing this would hit instead of an error it could branch on.
    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'jukebox',
      error: { code: 'unexpected' },
    })
    expect(run.code).toBe(1)
  })

  it('keeps what went wrong in the message', async () => {
    const run = await jukebox(['boom', '--json'], { root: explodes })

    const { error } = oneObject(run) as { error: { message: string } }
    expect(error.message).toContain('the disc is scratched')
  })
})

describe('exit codes', () => {
  it('is zero for everything that worked', async () => {
    for (const argv of [['--version'], ['version'], ['--help']]) {
      expect((await jukebox(argv)).code).toBe(0)
    }
  })

  it('is non-zero only for something that genuinely failed', async () => {
    for (const argv of [['sing'], []]) {
      expect((await jukebox(argv)).code).not.toBe(0)
    }
  })
})

describe('the home a run is given', () => {
  it('is where both directories resolve, and it is left empty', async () => {
    const run = await jukebox(['version'])

    // Everything the CLI would write lands inside the temporary home, which is
    // what makes a test safe to run on a machine someone uses.
    expect(run.locations.config.startsWith(run.home)).toBe(true)
    expect(run.locations.data.startsWith(run.home)).toBe(true)

    // Nothing is created. No configuration file, no Mirror, and no Library --
    // a folder for files that cannot yet arrive is a promise this release does
    // not keep.
    expect([...new Bun.Glob('**/*').scanSync(run.home)]).toEqual([])
  })
})
