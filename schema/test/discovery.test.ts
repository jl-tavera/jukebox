import { describe, expect, it } from 'bun:test'
import { discoveryProblems, type DiscoveryDocument } from '../src/discovery'

/**
 * The discovery document is hand-written, and the moment it is most likely to
 * be hand-written is during an outage. So what these cases are about is the
 * typo made then -- not the shape of the type, which every importer already
 * checks.
 *
 * None of this reads the file the site publishes, deliberately. #29 settled
 * that: the published document is checked by a CI step pointed at the export,
 * because a test asserting its contents would pin the file's location rather
 * than the behaviour that matters. What is tested here is the check itself.
 *
 * The fixture is typed rather than loose so the two declarations stay in step:
 * a field added to `DiscoveryDocument` stops this file compiling, which is the
 * prompt to teach `discoveryProblems` about it.
 */

const wellFormed: DiscoveryDocument = {
  api: 'https://jukebox-api-staging.example.workers.dev',
  min_version: '0.1.0',
  status: 'ok',
  message: null,
}

/** The fixture with one field replaced. */
const replacing = (field: string, value: unknown): unknown => ({
  ...wellFormed,
  [field]: value,
})

/** The fixture with one field absent. */
const omitting = (field: string): unknown => {
  const document: Record<string, unknown> = { ...wellFormed }
  delete document[field]
  return document
}

describe('what makes a discovery document unpublishable', () => {
  it('accepts a well-formed document', () => {
    expect(discoveryProblems(wellFormed)).toEqual([])
  })

  it('accepts a message alongside a healthy status', () => {
    expect(discoveryProblems(replacing('message', 'Back shortly.'))).toEqual([])
  })

  it('accepts a field it has never heard of', () => {
    expect(discoveryProblems({ ...wellFormed, install: '/install.sh' })).toEqual([])
  })

  it('rejects anything that is not a JSON object', () => {
    for (const value of ['{}', 7, true, null, [wellFormed]]) {
      expect(discoveryProblems(value)).toHaveLength(1)
    }
  })

  it('names every field that is absent', () => {
    for (const field of ['api', 'min_version', 'status', 'message']) {
      const problems = discoveryProblems(omitting(field))
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain(field)
    }
  })

  it('rejects an api that is not an address at all', () => {
    for (const api of ['api.jukebox.dev', '', 'https://', 12]) {
      expect(discoveryProblems(replacing('api', api))).toHaveLength(1)
    }
  })

  it('rejects an api the CLI could not reach over TLS', () => {
    for (const api of ['http://127.0.0.1:8787', 'ftp://example.com', 'ws://example.com']) {
      expect(discoveryProblems(replacing('api', api))).toHaveLength(1)
    }
  })

  // The CLI appends to this address, so an api that carries anything after the
  // host makes every request it builds subtly wrong rather than plainly broken.
  it('rejects an api carrying more than an origin', () => {
    for (const api of [
      'https://api.example.com/',
      'https://api.example.com/v1',
      'https://api.example.com?trace=1',
      'https://api.example.com#top',
    ]) {
      expect(discoveryProblems(replacing('api', api))).toHaveLength(1)
    }
  })

  it('accepts an origin carrying a port', () => {
    expect(discoveryProblems(replacing('api', 'https://api.example.com:8443'))).toEqual([])
  })

  it('rejects the two things an origin only looks like it may carry', () => {
    // Credentials in a document served to everybody, and a port that is not one.
    for (const api of ['https://user:pass@api.example.com', 'https://api.example.com:notaport']) {
      expect(discoveryProblems(replacing('api', api))).toHaveLength(1)
    }
  })

  it('rejects a min_version that is not major.minor.patch', () => {
    for (const version of ['0.1', 'v0.1.0', '0.1.0-beta.1', 'latest', 1]) {
      expect(discoveryProblems(replacing('min_version', version))).toHaveLength(1)
    }
  })

  it('rejects a status it would have to guess at', () => {
    for (const status of ['okay', 'OK', 'healthy', '', true]) {
      expect(discoveryProblems(replacing('status', status))).toHaveLength(1)
    }
  })

  it('names both statuses it would have accepted', () => {
    const problems = discoveryProblems(replacing('status', 'okay'))
    expect(problems[0]).toContain('"ok" or "down"')
  })

  it('accepts the status that takes the service down, with its sentence', () => {
    expect(discoveryProblems({ ...wellFormed, status: 'down', message: 'Back at 09:00 UTC.' }))
      .toEqual([])
  })

  it('rejects a kill switch with nothing to say', () => {
    const problems = discoveryProblems(replacing('status', 'down'))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('message')
  })

  it('rejects a message that is neither a sentence nor absent', () => {
    for (const message of [7, {}, ['down']]) {
      expect(discoveryProblems(replacing('message', message))).toHaveLength(1)
    }
  })

  it('reports every problem at once rather than the first', () => {
    const problems = discoveryProblems({
      api: 'api.jukebox.dev',
      min_version: '0.1',
      status: 'okay',
      message: 7,
    })
    expect(problems).toHaveLength(4)
  })
})
