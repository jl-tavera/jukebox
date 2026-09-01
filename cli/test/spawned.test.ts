import { afterAll, describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import pkg from '../package.json'
import { HOME_VARIABLE } from '../src/paths'
import { oneObject, removeHomes, temporaryHome } from './harness'

/**
 * The one test that spawns a process, and the reason the rest do not have to.
 *
 * Everywhere else the streams are handed to `main` by a test that decides for
 * itself whether they are terminals. That is fast, and it is a fake, and the
 * two things it cannot prove are the two only an operating system can answer:
 * that a pipe alone selects JSON, and that the code a shell sees is the code
 * `main` returned. Without this, "a pipe selects JSON" would be a claim about
 * the harness.
 *
 * It runs the entry point, not the compiled binary, and now that #38 compiles
 * one that is a choice rather than a limitation. What is under test here is the
 * boundary between the program and the operating system, and that boundary is
 * the same either way -- while cross-compiling five targets on every `bun test`
 * would cost about fifteen seconds to learn nothing this file does not already
 * know.
 *
 * The compiled binary is exercised where compiling it is the point: the release
 * workflow runs the freshly built Linux binary before publishing anything, and
 * its `verify` job installs the published one on macOS and Linux and asks it for
 * its version from a fresh shell.
 */

const entry = join(import.meta.dir, '..', 'src', 'index.ts')

afterAll(removeHomes)

const spawned = async (argv: string[]) => {
  const running = Bun.spawn([process.execPath, entry, ...argv], {
    // Piped, and nothing else about the invocation says so. Selecting JSON from
    // that alone is the behaviour under test.
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, [HOME_VARIABLE]: temporaryHome('jukebox-spawned-') },
  })

  const [stdout, stderr, code] = await Promise.all([
    new Response(running.stdout).text(),
    new Response(running.stderr).text(),
    running.exited,
  ])

  return { stdout, stderr, code }
}

describe('the CLI, run as its own process', () => {
  it('writes one JSON object into a pipe and exits zero', async () => {
    const run = await spawned(['version'])

    expect(oneObject(run)).toEqual({
      ok: true,
      command: 'version',
      version: pkg.version,
      data: { version: pkg.version },
    })
    expect(run.stderr).toBe('')
    expect(run.code).toBe(0)
  })

  it('exits non-zero when the command genuinely failed', async () => {
    const run = await spawned(['sing'])

    // The exit code a shell actually sees, which is the whole of what a
    // scheduled run has to check.
    expect(run.code).toBe(1)
    expect(oneObject(run)).toMatchObject({ ok: false, error: { code: 'invalid_usage' } })
  })

  it('writes the whole object even though the process ends immediately after', async () => {
    // `process.exit` can cut a write to a pipe short on the way out. Half an
    // object is the one thing a caller parsing this cannot survive, so the
    // entry point sets an exit code rather than exiting with one -- and this is
    // what would notice if that changed back.
    const help = oneObject(await spawned(['--help'])) as {
      data: { commands: { name: string }[] }
    }

    expect(help.data.commands.map((command) => command.name)).toEqual([
      'add',
      'config',
      'list',
      'remove',
      'show',
      'sync',
      'version',
    ])
  })
})
