/**
 * The discovery document: what the site publishes and every installed CLI reads
 * on boot. `docs/design/DESIGN.md` section 07 specifies it and this is that
 * shape, unchanged.
 *
 * It lives here rather than in `site/` because it is a contract between two
 * surfaces exactly as the API is, and `CLAUDE.md` puts anything shared between
 * surfaces in this package. ADR-0005 rejected the CLI's own output envelope
 * from here on the grounds that "the worker neither writes this shape nor reads
 * it"; that test still holds, and this passes it -- the site writes this
 * document and the CLI reads it, so it crosses a surface boundary exactly as
 * the API contract's own shapes do. See that ADR's amendment.
 *
 * It is declared by hand rather than generated from `openapi.yaml` because the
 * site serves it and the API does not. There is no path to describe.
 */

/**
 * Healthy, or not.
 *
 * The CLI's branch is binary: `ok` and it proceeds, anything else and it prints
 * `message` verbatim and exits cleanly. So a closed set buys nothing at that
 * branch, and it is not there for that branch -- it is there for the author.
 * The document is hand-edited, most often during an outage, and the realistic
 * failure then is a typo: `okay`, `OK`. A closed set is the only thing that
 * catches one, and a typo here is the difference between a kill switch and a
 * service that stays up.
 *
 * Declared as the values rather than as a union so the type and the check that
 * enforces it are one declaration. Written the other way round, adding a third
 * status widens the type and leaves the check still rejecting it.
 */
const STATUSES = ['ok', 'down'] as const

export type DiscoveryStatus = (typeof STATUSES)[number]

const isStatus = (value: unknown): value is DiscoveryStatus =>
  STATUSES.some((known) => known === value)

/**
 * Where the API is, the oldest binary it will serve, and whether to bother.
 *
 * `message` is written for a human and printed verbatim, which is the whole
 * reason the field exists: during an outage the reader should get a sentence
 * somebody wrote rather than a parse error against an error page.
 */
export type DiscoveryDocument = {
  /** An origin, and the only address the CLI does not compile in. */
  api: string
  /** The oldest CLI this API will serve. Below it, the CLI stops hard. */
  min_version: string
  status: DiscoveryStatus
  message: string | null
}

/**
 * A bare origin over TLS: scheme, host, optional port, and nothing after it.
 *
 * No path, query, fragment or trailing slash, because the CLI builds every
 * request by appending to this. Deciding here that it never ends in a slash is
 * cheaper than every call site deciding, and a document that gets it wrong
 * yields a double slash rather than an error anyone would notice. No userinfo
 * either: credentials in a document served to everybody are not credentials.
 *
 * Written as a pattern rather than with `URL` on purpose. This package's source
 * is compiled by four tsconfigs -- its own, and one per surface that imports it
 * -- and they declare different globals. Reaching for one here would make the
 * contract package's compilability depend on which surface happened to check
 * it, and `URL` is in exactly that position: absent here, present in every
 * consumer's. `tsconfig.json` sets `types: []` to keep it that way -- without
 * it, this package's own devDependency on Bun's types would quietly hand `src/`
 * a Node environment no consumer is obliged to provide.
 */
const ORIGIN = /^https:\/\/[^\s/?#@:]+(:\d+)?$/

/** `major.minor.patch`, and nothing else. The first release is `0.1.0`. */
const RELEASE = /^\d+\.\d+\.\d+$/

const show = (value: unknown): string =>
  typeof value === 'undefined' ? 'nothing' : JSON.stringify(value)

/**
 * Everything wrong with a document about to be published, worded for whoever
 * has to fix it. An empty list means there is nothing wrong.
 *
 * **This is the publish-time check, and it is deliberately the strict one.** A
 * CLI reading this document off the network must be more forgiving: a `status`
 * it has never heard of is still not `ok`, and refusing to boot on one would
 * brick every installed binary the day a third value is added. Leniency belongs
 * with the reader; #32 owns it. Do not reuse this function there.
 *
 * Every problem is reported rather than the first, because the reader is
 * plausibly editing this file at three in the morning and a second round trip
 * to learn about the second typo is a round trip too many.
 *
 * A field this does not know about is not a problem. The document gains fields
 * over time and a binary installed before one arrived has to keep booting --
 * forward compatibility is the point of reading an address at runtime at all.
 */
export const discoveryProblems = (value: unknown): string[] => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`the document is not a JSON object: ${show(value)}`]
  }

  const document = value as Record<string, unknown>
  const problems: string[] = []

  const api = document['api']
  if (typeof api !== 'string' || !ORIGIN.test(api)) {
    problems.push(`api: expected an https origin and nothing more, found ${show(api)}`)
  }

  const minVersion = document['min_version']
  if (typeof minVersion !== 'string' || !RELEASE.test(minVersion)) {
    problems.push(`min_version: expected major.minor.patch, found ${show(minVersion)}`)
  }

  const status = document['status']
  if (!isStatus(status)) {
    const known = STATUSES.map((one) => `"${one}"`).join(' or ')
    problems.push(`status: expected ${known}, found ${show(status)}`)
  }

  const message = document['message']
  if (typeof message !== 'string' && message !== null) {
    problems.push(`message: expected a sentence or null, found ${show(message)}`)
  }

  // The one rule that reads two fields, and the one this document exists for: a
  // kill switch the CLI prints nothing for has not switched anything off from
  // the reader's side. They see a command exit quietly and learn nothing.
  if (status === 'down' && message === null) {
    problems.push('message: a status of "down" has to say something; this one is null')
  }

  return problems
}
