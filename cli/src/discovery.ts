import type { DiscoveryDocument } from '@jukebox/schema'

/**
 * The document the site publishes and this binary reads on boot: where the API
 * is, the oldest client it will serve, and whether to bother.
 *
 * `docs/design/DESIGN.md` section 07 is the specification. The shape itself
 * lives in `schema/` because the site writes it and the CLI reads it; what
 * lives here is the reading, which is the CLI's alone.
 */

/**
 * The one address in the binary, and the reason everything else about where the
 * CLI points is data.
 *
 * `DESIGN.md` section 07 publishes `https://jukebox.dev/discovery.json` as the
 * intended address and `docs/design/SITE.md` section 08 records why it is not
 * the live one: the domain is registered to somebody else. Until that is
 * settled the site serves on workers.dev, and this names that.
 *
 * Changing this line costs a client release, which is exactly the cost the
 * whole discovery mechanism exists to avoid paying for the *API's* address. So
 * it is the one constant worth being uncomfortable about, and the reason the
 * `api` inside the document must never be allowed to become a second one.
 */
export const DISCOVERY_URL = 'https://jukebox-site.joseluis64tavera.workers.dev/discovery.json'

/**
 * How long the CLI waits for a document under a kilobyte before giving up.
 *
 * `mode.ts` already wrote down the rule this follows: a command that hangs in a
 * cron entry is worse than one that fails in it. A site that accepts the
 * connection and never answers is a real failure mode, and without a deadline
 * it is the one that takes a scheduled Sync down rather than just slowing it.
 */
const PATIENCE_MS = 5000

/**
 * An unknown value turned into a document this binary can boot from, or
 * nothing.
 *
 * **This is the reading half, and it is deliberately the forgiving one.**
 * `schema/`'s `discoveryProblems` is the publish-time check, it refuses
 * everything it cannot name, and its own comment says not to call it from here.
 * The asymmetry is the whole point: the author of the document is at a keyboard
 * and wants every typo listed, and the reader is an installed binary that must
 * not brick itself over one.
 *
 * So exactly one thing is refused -- a value that is not a JSON object, because
 * there is no document there to read. Everything else is taken as far as it
 * goes:
 *
 * - `api` and `min_version` are kept as whatever strings they are, and stood in
 *   for with an empty one when they are not strings at all. They are not
 *   checked, and not because a bad address is fine: refusing the document over
 *   one would throw away `status` and `message` with it, and the kill switch has
 *   to survive a broken address. An unusable address fails at the request that
 *   uses it, by which point the boot has already had its say.
 * - `status` is `ok` only when it is exactly that. `okay`, `OK`, `degraded`, a
 *   number and absent are all `down`. This is the one rule `schema/`'s comment
 *   writes out longhand, and the realistic failure it guards is a typo made
 *   during an outage. The word the site actually used is dropped, because
 *   nothing prints it: `message` is what the reader sees.
 * - `message` is a sentence or nothing.
 *
 * A field this has never heard of is dropped rather than carried. Forward
 * compatibility is a property of the boot not *failing* on one, and this binary
 * has nothing to do with a value it cannot name.
 *
 * Idempotent, which matters because it runs over the saved copy on the way out
 * as well as over the network's answer on the way in. One reader and two
 * sources, so a hand-edited cache cannot get in through a door the network
 * could not.
 */
export const readDiscovery = (value: unknown): DiscoveryDocument | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined

  const document = value as Record<string, unknown>
  const message = document['message']

  return {
    api: asString(document['api']),
    min_version: asString(document['min_version']),
    // Exactly `ok`, and everything else is `down`. Written this way round on
    // purpose: a third status added to the document years from now reads as
    // "not healthy" to a binary shipped today, which is the safe answer and the
    // one that leaves it still able to print the message.
    status: document['status'] === 'ok' ? 'ok' : 'down',
    message: typeof message === 'string' ? message : null,
  }
}

/**
 * A string, or the empty one.
 *
 * Only for the two fields whose absence is not meaningful: every reader
 * downstream of them wants a string either way, and an empty address fails at
 * the request while an empty minimum does not gate. `message` is coerced on its
 * own because its fallback is `null` rather than empty -- absent and blank are
 * different things there, and the boot supplies a sentence for both.
 */
const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * The document, off the network.
 *
 * Every unusable answer throws, and they all throw the same kind of thing: a
 * refused connection, a timeout, a non-2xx, a body that is not JSON, and a body
 * that is JSON but not a document are one fact from the boot's side -- there is
 * no fresh document -- and the boot's fallback is the same for all of them.
 *
 * The last two are not hypothetical. The site answers a missing file with its
 * own 404 page rather than with `index.html`, precisely so that a document that
 * failed to publish arrives as HTML with a 404 instead of being mistaken for
 * one; `site/wrangler.jsonc` says so where it sets `not_found_handling`.
 */
export const fetchDiscovery = async (url: string): Promise<DiscoveryDocument> => {
  const answer = await fetch(url, {
    signal: AbortSignal.timeout(PATIENCE_MS),
    headers: { accept: 'application/json' },
  })

  if (!answer.ok) throw new Error(`the site answered ${answer.status}`)

  // Parsed by hand rather than with `answer.json()`, so that a body which is
  // not JSON reads as "not a document" rather than as whatever wording the
  // runtime's parser happens to use. The message reaches a person, in a warning.
  const body = await answer.text()

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('the site answered with something that is not JSON')
  }

  const document = readDiscovery(parsed)
  if (document === undefined) {
    throw new Error('the site answered with something that is not a document')
  }

  return document
}
