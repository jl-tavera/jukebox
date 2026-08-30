import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandDef } from 'citty'
import type { Io } from '../src/io'
import { main } from '../src/main'
import { HOME_VARIABLE, locations, type Locations } from '../src/paths'

/**
 * Seam 3: the CLI's own entry point, driven with an argument vector against a
 * home of this run's own.
 *
 * `main` is called rather than a process spawned, and the streams are handed to
 * it the same way the binary hands over the real ones -- the trick
 * `worker/test/api.ts` uses to give the worker bindings of a test's own, at the
 * same kind of boundary. `spawned.test.ts` holds the one real process that
 * keeps this honest: without it, "a pipe selects JSON" would be a claim about a
 * fake.
 */

export type Run = {
  /** Data. In JSON mode this is exactly one object and nothing else. */
  stdout: string
  /** Everything that is not data. */
  stderr: string
  code: number
  /** The temporary home this run was given. */
  home: string
  /** Where the CLI resolved to inside it, while it was running. */
  locations: Locations
}

export type Options = {
  /** Whether stdout is a terminal. A terminal by default, so JSON is deliberate. */
  tty?: boolean
  /** Whether anybody is there to answer a question. */
  stdin?: boolean
  /** A command tree of this test's own, for the paths the real one cannot reach. */
  root?: CommandDef
  /**
   * The home this run is given. A fresh one unless a test hands one over.
   *
   * Handing one over is how two runs come to share a saved discovery document,
   * and so the only way anything about caching is reachable at all: without it
   * every run starts from an empty directory and the second one can never find
   * what the first one wrote.
   */
  home?: string
  /** Where the discovery document is read from. The site's own address by default. */
  discovery?: string
  /** Variables set for the length of this run and put back after, as the home already is. */
  env?: Record<string, string | undefined>
  /**
   * Runs after the home exists and before `main` does, against the locations
   * this run resolved to.
   *
   * This is how a test ages a saved document -- by editing a number in a file
   * the CLI wrote itself -- rather than by handing the CLI a clock it would then
   * have to carry in production for a test's sake.
   */
  prepare?: (locations: Locations) => void
}

const homes: string[] = []

/** A directory of this run's own, removed by `removeHomes`. */
export const temporaryHome = (name: string): string => {
  const home = mkdtempSync(join(tmpdir(), name))
  homes.push(home)
  return home
}

/** Removes every home handed out so far. Called from an afterAll. */
export const removeHomes = () => {
  while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true })
}

/**
 * Runs are serialised, and it is not an optimisation.
 *
 * The home is handed over through the environment, because that is where
 * `locations` reads it and a process has exactly one of those. Two runs
 * overlapping would each put the environment back the way they found it, out
 * from under the other -- and nothing in this ticket reads a path, so the
 * failure would surface in whichever later ticket first did.
 */
let queue: Promise<unknown> = Promise.resolve()

export const jukebox = async (argv: string[], options: Options = {}): Promise<Run> => {
  const run = queue.then(() => runOnce(argv, options))
  queue = run.catch(() => {})
  return run
}

const runOnce = async (argv: string[], options: Options): Promise<Run> => {
  const home = options.home ?? temporaryHome('jukebox-')

  let stdout = ''
  let stderr = ''
  const io: Io = {
    out: (text) => void (stdout += text),
    err: (text) => void (stderr += text),
    stdoutIsTty: options.tty ?? true,
    stdinIsTty: options.stdin ?? true,
  }

  const restore = forThisRun({ ...options.env, [HOME_VARIABLE]: home })

  try {
    const where = locations()
    options.prepare?.(where)

    const code = await main(argv, io, { root: options.root, discovery: options.discovery })
    return { stdout, stderr, code, home, locations: where }
  } finally {
    restore()
  }
}

/**
 * Sets each variable for the length of one run and puts the environment back
 * exactly as it was found, including the ones that were not set at all.
 *
 * The unsetting is the half that is easy to leave out and expensive to leave
 * out. A variable one test set would otherwise still be set for the next, and
 * the run that then failed would be the one that never mentioned it.
 */
const forThisRun = (values: Record<string, string | undefined>): (() => void) => {
  const before = Object.keys(values).map((name) => [name, process.env[name]] as const)

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  return () => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

/**
 * The single object a run in JSON mode is required to have written, parsed.
 *
 * Written as an assertion rather than a bare `JSON.parse` because "exactly one"
 * is the part worth protecting: a second line, a warning that wandered onto
 * stdout, or a stack trace all still parse as something.
 */
export const oneObject = (run: { stdout: string }): Record<string, unknown> => {
  const lines = run.stdout.split('\n').filter((line) => line !== '')
  if (lines.length !== 1) {
    throw new Error(`expected exactly one line on stdout, got ${lines.length}: ${run.stdout}`)
  }

  return JSON.parse(lines[0]!) as Record<string, unknown>
}
