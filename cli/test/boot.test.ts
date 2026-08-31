import { afterAll, describe, expect, it } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiscoveryDocument } from '@jukebox/schema'
import { defineCommand } from 'citty'
import { CACHE_FILE, FRESH_FOR_MS } from '../src/cache'
import { succeeded } from '../src/outcome'
import type { Locations } from '../src/paths'
import { backend } from '../src/session'
import { VERSION } from '../src/version'
import { jukebox, oneObject, removeHomes, temporaryHome, type Options, type Run } from './harness'
import { healthy, serving, stopServing } from './server'

/**
 * Seam 3 again, this time with the outside world attached: an argument vector
 * against a home of this run's own and a real site on an ephemeral port.
 *
 * #33 registers no command that needs a backend -- `add` at #35 is the first --
 * so without a command tree of this file's own the whole boot sequence would
 * have no caller, and every outcome the ticket is about would be unobservable
 * until a later ticket. That is the same trick and the same justification as
 * `explodes` in `cli.test.ts`, which `main`'s own doc comment already blesses.
 *
 * That the command *asks* for the backend rather than being handed one is the
 * design under test as much as anything else here. A command that needs the
 * network says so by asking; `version` never asks, and that is what makes
 * "commands that read only local state work with no network at all" a property
 * of the shape rather than of a list somebody has to keep in step.
 */

afterAll(removeHomes)
afterAll(stopServing)

const tree = defineCommand({
  meta: { name: 'jukebox' },
  subCommands: {
    reach: defineCommand({
      meta: { name: 'reach', description: 'Reports the address the boot resolved' },
      run: async ({ data }) => {
        const { api } = await backend(data)
        return succeeded('reach', { api }, () => api)
      },
    }),
    // The other half of the pair. It reads nothing, asks for nothing, and is
    // what a `list` or a `show` will look like at #37.
    homebody: defineCommand({
      meta: { name: 'homebody', description: 'Touches nothing outside this machine' },
      run: () => succeeded('homebody', { fine: true }, () => 'fine'),
    }),
  },
})

/** One run of the command that asks for a backend. JSON unless told otherwise. */
const asking = (options: Options, argv: string[] = ['reach', '--json']) =>
  jukebox(argv, { root: tree, ...options })

/** The address a run came back with. */
const reached = (run: Run): string => (oneObject(run).data as { api: string }).api

/** The failure a run came back with. */
const refusal = (run: Run) => oneObject(run).error as { code: string; message: string }

/**
 * Ages the saved document past its freshness window.
 *
 * There is no clock to move -- the CLI reads the real one, and a test that
 * replaced it would be testing its own replacement. What is *in* the file is
 * never written here either: the document got there by a real run against the
 * real site, which is also the only way to be sure the CLI writes one at all.
 * A helper that fabricated the cache would pass just as happily against a CLI
 * that never cached anything.
 */
const age = (where: Locations) => {
  const file = join(where.data, CACHE_FILE)
  const seen = JSON.parse(readFileSync(file, 'utf8')) as { fetched_at: number }
  seen.fetched_at = Date.now() - FRESH_FOR_MS - 60_000
  writeFileSync(file, JSON.stringify(seen))
}

/**
 * A run whose saved document is old and whose site has since gone away.
 *
 * Four steps, and every test about the fallback needs all four: prime the cache
 * against a live site, stop it, age what was saved, then run again at the same
 * address. Written once so that each test below reads as the question it asks
 * rather than as the arrangement it needs to ask it.
 *
 * The site is stopped rather than never started, and the address reused, so the
 * CLI meets a connection genuinely refused instead of a rejection a test
 * invented.
 */
const afterTheSiteWentAway = async (
  name: string,
  options: { document?: DiscoveryDocument; argv?: string[] } = {},
) => {
  const site = serving(options.document ?? healthy())
  const home = temporaryHome(name)

  await asking({ home, discovery: site.url })
  await site.stop()

  return { site, run: await asking({ home, discovery: site.url, prepare: age }, options.argv) }
}

describe('finding the backend', () => {
  it('reaches the address the document names', async () => {
    const site = serving(healthy({ api: 'https://api.example.test' }))
    const run = await asking({ discovery: site.url })

    expect(reached(run)).toBe('https://api.example.test')
    expect(run.code).toBe(0)
  })

  it('keeps a copy, so a later run has something to fall back on', async () => {
    const site = serving()
    const run = await asking({ discovery: site.url })

    expect(readFileSync(join(run.locations.data, CACHE_FILE), 'utf8')).toContain('api.example.test')
  })

  it('boots on a document carrying a field it has never heard of', async () => {
    // Forward compatibility is the point of reading an address at runtime at
    // all. A binary installed before a field arrived has to keep working.
    const site = serving()
    site.serves({ ...healthy(), mirrors: ['https://spare.example.test'] })

    expect((await asking({ discovery: site.url })).code).toBe(0)
  })
})

describe('a document already saved', () => {
  it('is preferred while it is fresh, even after the site changes its mind', async () => {
    // Observed the way a user would: the site is now saying something else and
    // the CLI goes on reporting what it already had. Nothing here asks whether
    // a request was made -- the answer being the *old* address is only possible
    // if one was not.
    const site = serving(healthy({ api: 'https://one.example.test' }))
    const home = temporaryHome('jukebox-fresh-')

    expect(reached(await asking({ home, discovery: site.url }))).toBe('https://one.example.test')

    site.serves(healthy({ api: 'https://two.example.test' }))
    site.forgets()

    const again = await asking({ home, discovery: site.url })
    expect(reached(again)).toBe('https://one.example.test')
    expect(site.requests).toBe(0)
  })

  it('is asked for again once it is no longer fresh', async () => {
    // The other half, and the reason the test above is not equally satisfied by
    // a CLI that fetches once and never again. One without the other proves the
    // wrong thing.
    const site = serving(healthy({ api: 'https://one.example.test' }))
    const home = temporaryHome('jukebox-stale-')

    await asking({ home, discovery: site.url })
    site.serves(healthy({ api: 'https://two.example.test' }))

    const again = await asking({ home, discovery: site.url, prepare: age })
    expect(reached(again)).toBe('https://two.example.test')
  })

  it('is ignored when it was saved by a run pointed somewhere else', async () => {
    // A copy fetched from a site on an ephemeral port is not a copy of the real
    // one, and a developer who pointed at a local site once should not spend
    // the next hour talking to a port that has closed.
    const first = serving(healthy({ api: 'https://one.example.test' }))
    const second = serving(healthy({ api: 'https://two.example.test' }))
    const home = temporaryHome('jukebox-elsewhere-')

    await asking({ home, discovery: first.url })

    expect(reached(await asking({ home, discovery: second.url }))).toBe('https://two.example.test')
  })

  it('is treated as absent when it cannot be read', async () => {
    const site = serving()
    const home = temporaryHome('jukebox-corrupt-')

    await asking({ home, discovery: site.url })

    const run = await asking({
      home,
      discovery: site.url,
      prepare: (where) => writeFileSync(join(where.data, CACHE_FILE), '{ not json'),
    })

    // Silently refetched. The file is ours and rebuildable, and there is
    // nothing a person could do about it that fetching again does not do.
    expect(run.code).toBe(0)
    expect(run.stderr).toBe('')
  })
})

describe('a site that cannot be reached', () => {
  it('falls back to the last document seen rather than dying', async () => {
    const { run } = await afterTheSiteWentAway('jukebox-fallback-', {
      document: healthy({ api: 'https://one.example.test' }),
    })

    expect(reached(run)).toBe('https://one.example.test')
    expect(run.code).toBe(0)
  })

  it('says it is working from an old copy', async () => {
    const { site, run } = await afterTheSiteWentAway('jukebox-warns-')

    expect(run.stderr.toLowerCase()).toContain('last')
    expect(run.stderr).toContain(site.url)
  })

  it('keeps that warning off stdout, so one object is still all there is', async () => {
    // A warning that wandered onto stdout breaks every caller that reads it
    // whole and parses it -- which is the guarantee, and the only one.
    const { run } = await afterTheSiteWentAway('jukebox-warns-json-')

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'reach' })
    expect(run.stderr).not.toBe('')
  })

  it('warns a person at a terminal too', async () => {
    const { run } = await afterTheSiteWentAway('jukebox-warns-human-', { argv: ['reach'] })

    expect(run.stderr.toLowerCase()).toContain('last')
    expect(run.stdout.trim()).toBe('https://api.example.test')
  })

  it('stops when there is nothing saved to fall back on', async () => {
    const site = serving()
    await site.stop()

    const run = await asking({ discovery: site.url })

    expect(refusal(run).code).toBe('network_unreachable')
    expect(run.code).toBe(1)
  })

  it('treats an error page as no answer at all', async () => {
    // The site answers a missing file with its own 404 page rather than with
    // index.html, precisely so a document that failed to publish arrives as
    // HTML instead of being mistaken for one.
    const site = serving()
    site.serves('<!doctype html><title>404</title>', 404)

    expect(refusal(await asking({ discovery: site.url })).code).toBe('network_unreachable')
  })

  it('treats a body it cannot parse the same way', async () => {
    const site = serving()
    site.serves('not json at all')

    expect(refusal(await asking({ discovery: site.url })).code).toBe('network_unreachable')
  })

  it('treats a body that is not a document the same way', async () => {
    const site = serving()
    site.serves(['not', 'a', 'document'])

    expect(refusal(await asking({ discovery: site.url })).code).toBe('network_unreachable')
  })
})

describe('a document that requires a newer binary', () => {
  it('stops hard, and says what to do about it', async () => {
    // A gate that has never once refused is a gate you discover is broken on
    // the day you need it. This is the test that keeps it honest before any
    // binary is old enough to need it.
    const site = serving(healthy({ min_version: '99.0.0' }))
    const run = await asking({ discovery: site.url })

    const { code, message } = refusal(run)
    expect(code).toBe('version_unsupported')
    expect(message).toContain('99.0.0')
    expect(message).toContain(VERSION)
    expect(message.toLowerCase()).toContain('upgrade')

    // A hard stop, not a warning: non-zero, and no address came back.
    expect(run.code).toBe(1)
    expect(oneObject(run).data).toBeUndefined()
  })

  it('stops on a saved document too, not only a fetched one', async () => {
    const site = serving(healthy({ min_version: '99.0.0' }))
    const home = temporaryHome('jukebox-gate-saved-')

    await asking({ home, discovery: site.url })
    await site.stop()

    // The gate is downstream of where the document came from, so a fallback
    // cannot walk past it. This is the run that would slip through if it did.
    expect(refusal(await asking({ home, discovery: site.url })).code).toBe('version_unsupported')
  })

  it('runs when the minimum is exactly this version', async () => {
    // The published document names the release it shipped beside. An exclusive
    // gate would refuse the very binary it was written for.
    const site = serving(healthy({ min_version: VERSION }))

    expect((await asking({ discovery: site.url })).code).toBe(0)
  })

  it('does not gate on a minimum it cannot read', async () => {
    const site = serving(healthy({ min_version: 'latest' }))

    expect((await asking({ discovery: site.url })).code).toBe(0)
  })

  it('refuses before it reports an outage', async () => {
    // Step order, and it matters: a binary too old to understand the contract
    // must be told to upgrade rather than told to come back later, because
    // coming back later will not help it.
    const site = serving(healthy({ min_version: '99.0.0', status: 'down', message: 'Back soon.' }))

    expect(refusal(await asking({ discovery: site.url })).code).toBe('version_unsupported')
  })
})

describe('a service that says it is not well', () => {
  const MESSAGE = 'Jukebox is down for maintenance. Back at 09:00 UTC.'

  it('prints the message word for word', async () => {
    // Verbatim is the whole reason the field exists: during an outage the
    // reader gets a sentence a person wrote rather than a parse error against
    // an error page. It is also what lets the copy improve without a client
    // release, which summarising or rewording it would quietly undo.
    const site = serving(healthy({ status: 'down', message: MESSAGE }))
    const run = await asking({ discovery: site.url }, ['reach'])

    expect(run.stderr.trim()).toBe(MESSAGE)
    expect(run.stdout).toBe('')
  })

  it('carries the message and a code a script can branch on', async () => {
    const site = serving(healthy({ status: 'down', message: MESSAGE }))
    const run = await asking({ discovery: site.url })

    expect(refusal(run)).toEqual({ code: 'service_down', message: MESSAGE })
    expect(run.code).toBe(1)
  })

  it('writes exactly one object in JSON mode', async () => {
    const site = serving(healthy({ status: 'down', message: MESSAGE }))
    const run = await asking({ discovery: site.url })

    expect(oneObject(run)).toMatchObject({ ok: false, command: 'jukebox' })
  })

  it('never runs the command that was asked for', async () => {
    const site = serving(healthy({ status: 'down', message: MESSAGE }))
    const run = await asking({ discovery: site.url })

    expect(oneObject(run).data).toBeUndefined()
  })

  it('treats a status it has never heard of as not well', async () => {
    // Refusing to boot on an unknown status would brick every installed binary
    // the day a third value is added. Reading it as "not ok" keeps the kill
    // switch working and the client alive.
    const site = serving()
    site.serves({ ...healthy(), status: 'wedged', message: MESSAGE })

    expect(refusal(await asking({ discovery: site.url })).code).toBe('service_down')
  })

  it('says something of its own when the message is there but empty', async () => {
    // The publish-time check only refuses a `down` document whose message is
    // *null*, so an empty one is publishable and reaches a reader. Falling back
    // on absence alone would print a blank line and exit -- which is the exact
    // silence the sentence below exists to break.
    const site = serving(healthy({ status: 'down', message: '   ' }))
    const run = await asking({ discovery: site.url }, ['reach'])

    expect(run.stderr.trim()).not.toBe('')
    expect(run.code).toBe(1)
  })

  it('says something of its own when the document said nothing', async () => {
    // Publishing this document is refused by the schema's check, so it only
    // arrives when that was bypassed. A kill switch the CLI prints nothing for
    // has not switched anything off from the reader's side.
    const site = serving(healthy({ status: 'down', message: null }))
    const run = await asking({ discovery: site.url }, ['reach'])

    expect(run.stderr.trim()).not.toBe('')
    expect(run.code).toBe(1)
  })
})

describe('an API address given by the environment', () => {
  it('is used instead of the one the document names', async () => {
    const site = serving(healthy({ api: 'https://published.example.test' }))
    const run = await asking({ discovery: site.url, env: { JUKEBOX_API: 'http://127.0.0.1:8787' } })

    // Plain http and a port, which is what a local worker is. The rule that the
    // address must be https is a rule about the published document.
    expect(reached(run)).toBe('http://127.0.0.1:8787')
  })

  it('overrides the address and nothing else', async () => {
    // The whole of the acceptance criterion. A developer pointed at their own
    // worker is still refused by a gate that refuses.
    const site = serving(healthy({ min_version: '99.0.0' }))
    const run = await asking({ discovery: site.url, env: { JUKEBOX_API: 'http://127.0.0.1:8787' } })

    expect(refusal(run).code).toBe('version_unsupported')
  })

  it('does not silence an outage either', async () => {
    const site = serving(healthy({ status: 'down', message: 'Back soon.' }))
    const run = await asking({ discovery: site.url, env: { JUKEBOX_API: 'http://127.0.0.1:8787' } })

    expect(refusal(run).code).toBe('service_down')
  })

  it('is not set when it is empty', async () => {
    // The same rule JUKEBOX_HOME follows, and for the same reason: a blank
    // value should not quietly mean an address of nothing.
    const site = serving(healthy({ api: 'https://published.example.test' }))
    const run = await asking({ discovery: site.url, env: { JUKEBOX_API: '' } })

    expect(reached(run)).toBe('https://published.example.test')
  })

  it('drops a trailing slash, because every request appends to it', async () => {
    // The schema decided the published address never ends in one, so that every
    // call site does not have to. A developer typing one by hand should not get
    // a double slash on every request.
    const site = serving()
    const run = await asking({
      discovery: site.url,
      env: { JUKEBOX_API: 'http://127.0.0.1:8787/' },
    })

    expect(reached(run)).toBe('http://127.0.0.1:8787')
  })
})

describe('a command that reads only local state', () => {
  it('runs with no site to talk to and nothing saved', async () => {
    const site = serving()
    await site.stop()

    const run = await jukebox(['homebody', '--json'], { root: tree, discovery: site.url })

    expect(oneObject(run)).toMatchObject({ ok: true, command: 'homebody' })
    expect(run.code).toBe(0)
    expect(run.stderr).toBe('')
  })

  it('does not so much as ask the site', async () => {
    // `cli.test.ts` makes the neighbouring claim with nothing to talk to. This
    // makes it with a site standing right there, which is the version that
    // would notice a boot that stopped waiting to be asked.
    const site = serving()
    const run = await jukebox(['homebody'], { root: tree, discovery: site.url })

    expect(site.requests).toBe(0)
    expect(run.code).toBe(0)
  })

  it('leaves its home completely empty', async () => {
    const site = serving()
    const run = await jukebox(['homebody'], { root: tree, discovery: site.url })

    // No saved document, because nothing fetched one. A command that reads only
    // local state writes nothing either.
    expect([...new Bun.Glob('**/*').scanSync(run.home)]).toEqual([])
  })
})
