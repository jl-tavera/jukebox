import { describe, expect, it } from 'bun:test'
import { readDiscovery } from '../src/discovery'

/**
 * A pure seam, called directly, the way `paths.test.ts` and `mode.test.ts` are.
 *
 * This is the reading half of the discovery document, and its whole character
 * is that it is the *forgiving* one. `schema/`'s `discoveryProblems` is the
 * publish-time check and refuses everything it cannot name; its own comment
 * forbids reusing it here, because a reader that refused to boot on a `status`
 * it had never heard of would brick every installed binary the day a third
 * value is added.
 *
 * So most of what is below asserts that something malformed is *accepted*,
 * which reads oddly until you remember what the alternative costs. The cases
 * are enumerated here because there are a lot of them and each one would
 * otherwise need a server and a run.
 */

const WELL_FORMED = {
  api: 'https://api.example.test',
  min_version: '0.1.0',
  status: 'ok',
  message: null,
}

describe('a document the reader can boot from', () => {
  it('takes a well-formed one as it stands', () => {
    expect(readDiscovery(WELL_FORMED)).toEqual({
      api: 'https://api.example.test',
      min_version: '0.1.0',
      status: 'ok',
      message: null,
    })
  })

  it('keeps a message when there is one', () => {
    const read = readDiscovery({ ...WELL_FORMED, status: 'down', message: 'Back at 09:00 UTC.' })

    expect(read?.message).toBe('Back at 09:00 UTC.')
  })

  it('gives back what it was given, fed its own output', () => {
    // It runs over the saved copy on the way out as well as over the network's
    // answer on the way in. One reader and two sources, so a hand-edited cache
    // cannot get in through a door the network could not -- which only holds if
    // a second pass changes nothing.
    const once = readDiscovery(WELL_FORMED)

    expect(readDiscovery(once)).toEqual(once!)
  })
})

describe('the one thing the reader refuses', () => {
  it('refuses a value that is not a JSON object', () => {
    // There is no document there to read. Everything else it is handed, it
    // takes as far as it goes.
    for (const value of [null, undefined, 7, 'ok', true, [], [WELL_FORMED]]) {
      expect(readDiscovery(value)).toBeUndefined()
    }
  })
})

describe('a status the reader has never heard of', () => {
  it('is not ok, whatever it is', () => {
    // The rule `schema/src/discovery.ts` writes out longhand. The realistic
    // failure is a typo made during an outage -- `okay`, `OK` -- and the one
    // thing that must not happen is a kill switch read as healthy.
    for (const status of ['okay', 'OK', 'Ok', 'degraded', 'down', '', 7, null, undefined, {}]) {
      expect(readDiscovery({ ...WELL_FORMED, status })?.status).toBe('down')
    }
  })

  it('is ok only when it is exactly that', () => {
    expect(readDiscovery(WELL_FORMED)?.status).toBe('ok')
  })

  it('does not take the document down with it', () => {
    // The document still has to yield its message, which during an outage is
    // the only thing the reader is there for.
    const read = readDiscovery({ ...WELL_FORMED, status: 'wedged', message: 'Back shortly.' })

    expect(read).toEqual({
      api: 'https://api.example.test',
      min_version: '0.1.0',
      status: 'down',
      message: 'Back shortly.',
    })
  })
})

describe('fields the publish-time check would reject', () => {
  it('keeps an api that is not an origin', () => {
    // Rejecting the document over the address would throw away `status` and
    // `message` with it, and the kill switch has to survive a broken address.
    // An unusable one fails at the request that uses it, by which point the
    // boot has already had its say.
    for (const api of ['http://127.0.0.1:8787', 'https://api.example.test/', 'nonsense', '']) {
      expect(readDiscovery({ ...WELL_FORMED, api })?.api).toBe(api)
    }
  })

  it('keeps a min_version that is not a release', () => {
    // What an unreadable one does is `olderThan`'s business, and what it does
    // is nothing. Refusing the document here would turn a typo into an outage.
    for (const minimum of ['latest', '0.1', '']) {
      expect(readDiscovery({ ...WELL_FORMED, min_version: minimum })?.min_version).toBe(minimum)
    }
  })

  it('stands in for an api or a min_version that is not a string at all', () => {
    const read = readDiscovery({ ...WELL_FORMED, api: 7, min_version: null })

    // Empty rather than absent, so every reader downstream has a string. An
    // empty address fails at the request and an empty minimum does not gate,
    // which are the same answers a malformed one already gets.
    expect(read).toMatchObject({ api: '', min_version: '' })
  })

  it('treats a message that is not a sentence as no message', () => {
    for (const message of [7, {}, undefined]) {
      expect(readDiscovery({ ...WELL_FORMED, message })?.message).toBeNull()
    }
  })

  it('accepts a document that is down and says nothing, which publishing would not', () => {
    // `discoveryProblems` refuses this one outright. Here it has to be read,
    // because it is what arrives when that check was bypassed -- and the boot,
    // not the reader, is what supplies the missing sentence.
    expect(readDiscovery({ ...WELL_FORMED, status: 'down' })).toMatchObject({
      status: 'down',
      message: null,
    })
  })
})

describe('a document from a later release', () => {
  it('boots on one carrying a field this binary has never heard of', () => {
    // Forward compatibility is the point of reading an address at runtime at
    // all. The field is dropped rather than kept: this binary has nothing to do
    // with a value it cannot name.
    const read = readDiscovery({ ...WELL_FORMED, mirrors: ['https://spare.example.test'] })

    expect(read).toEqual({
      api: 'https://api.example.test',
      min_version: '0.1.0',
      status: 'ok',
      message: null,
    })
  })
})
