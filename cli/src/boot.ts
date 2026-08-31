import type { DiscoveryDocument } from '@jukebox/schema'
import { isFresh, lastSeen, remember } from './cache'
import { fetchDiscovery } from './discovery'
import type { ClientErrorCode } from './errors'
import { olderThan, VERSION } from './version'

/**
 * The boot sequence: `docs/design/DESIGN.md` section 07, in order.
 *
 *   1. Use the saved document while it is fresh.
 *   2. Otherwise fetch it; on failure fall back to the last one seen and warn
 *      rather than dying.
 *   3. If this binary predates the minimum, stop hard.
 *   4. If the status is not healthy, print the message verbatim and stop.
 *   5. Hand back the address, which an environment variable may override.
 *
 * Nothing here runs unless a command asks for it. That is the whole of how
 * "commands that read only local state work with no network at all" is kept
 * true: there is exactly one door to the network -- `session.ts`'s `backend`,
 * which opens onto this -- and a command that does not open it cannot fetch,
 * cannot read the saved copy, and cannot write one. No list of which commands
 * need a backend exists, because a list is a copy of a fact that already lives
 * in each command's body, and the two drift.
 */

/**
 * Where the API is, and the whole of what survived the boot.
 *
 * A record rather than a bare string, and not for room to grow: it is
 * deliberately everything a command is allowed to know. `min_version`, `status`
 * and `message` were all read on the way here and all decided about, so handing
 * a command the document itself would hand it a `status` it must not act on --
 * and the second place that acted on one would be the place the two disagree.
 */
export type Backend = { api: string }

/** One variable, and it moves one thing. See the comment where it is read. */
export const API_VARIABLE = 'JUKEBOX_API'

/**
 * A boot that stopped, carrying the code and the sentence it stopped with.
 *
 * Thrown rather than returned, because there is nothing on the other side of a
 * refused version gate for a command to do: no command continues usefully once
 * the backend has said it will not serve this binary. A result a command *could*
 * ignore is a result a command will eventually ignore.
 *
 * `main`'s single catch turns it back into the result object everything else is,
 * so throwing costs nothing at the boundary.
 */
export class BootStop extends Error {
  constructor(readonly code: ClientErrorCode, message: string) {
    super(message)
    this.name = 'BootStop'
  }
}

/**
 * What is printed when the status is not healthy and the document gave no
 * reason.
 *
 * `schema/`'s publish-time check refuses to publish that document, so this is
 * what happens when one was published anyway -- the check bypassed, or a status
 * this binary is too old to have been given a message for. That check's own rule
 * cuts both ways: a kill switch the CLI prints nothing for has not switched
 * anything off from the reader's side, and a blank line on stderr is exactly
 * nothing.
 */
const NOTHING_SAID =
  "Jukebox's backend is reporting itself unavailable and did not say why. Try again shortly."

/**
 * The sequence itself, run once per run by whoever holds the thunk over it.
 *
 * Exported rather than private since #36 moved `lazily` into `session.ts`: the
 * memoising is a property of a run and this is the thing being memoised, so the
 * two sit either side of the module boundary rather than one hiding the other.
 */
export const boot = async (url: string, warn: (text: string) => void): Promise<Backend> => {
  const document = await current(url, warn)

  // Step 3. Before the status, and the order is not arbitrary: a binary too old
  // to understand the contract has to be told to upgrade rather than told to
  // come back later, because coming back later will not help it.
  if (olderThan(VERSION, document.min_version)) {
    throw new BootStop(
      'version_unsupported',
      `This copy of Jukebox is ${VERSION}, and the API now serves ` +
        `${document.min_version} or newer. Upgrade to the latest release and run this again.`,
    )
  }

  // Step 4. The message goes out exactly as it arrived: that is what the field
  // is for, and it is what lets the copy improve without a client release.
  if (document.status !== 'ok') {
    // Blank counts as nothing said rather than as something said. The
    // publish-time check only refuses a `down` document whose message is
    // *null*, so an empty one is publishable -- and `render` prints nothing at
    // all for an empty string, which would leave the kill switch silent exactly
    // where it most needs to speak. Only a blank is substituted, so a real
    // message still goes out exactly as it arrived.
    const said = document.message ?? ''
    throw new BootStop('service_down', said.trim() === '' ? NOTHING_SAID : said)
  }

  // Step 5, and being last **is** the enforcement of "it overrides the API
  // address only; the rest of the boot still runs". That is not a rule anybody
  // has to remember here: the document was fetched, the gate ran and the status
  // was checked above, and not one of them reads `api`. A developer pointed at
  // their own worker is still refused by a gate that refuses, and still reads an
  // outage message that exists.
  //
  // Empty is not set, the same rule `JUKEBOX_HOME` follows and for the same
  // reason: a blank value should not quietly mean an address of nothing.
  //
  // The trailing slash goes because every request appends to this, and the
  // schema already decided the published address never ends in one -- so
  // deciding it here too is cheaper than every call site deciding. No scheme
  // check: this variable exists so a local worker over plain http can be
  // reached, and "must be https" is a rule about the published document.
  const api = process.env[API_VARIABLE] || document.api

  return { api: api.replace(/\/+$/, '') }
}

/**
 * Steps 1 and 2: the freshest document there is, and a warning if that is an
 * old one.
 *
 * The fetch's every failure is caught together, because from here they are one
 * fact -- there is no fresh document -- and the fallback is the same for all of
 * them. A refused connection, a timeout, a 404 carrying an error page and a body
 * that is not a document differ only in the sentence the warning quotes.
 */
const current = async (
  url: string,
  warn: (text: string) => void,
): Promise<DiscoveryDocument> => {
  const seen = lastSeen(url)
  if (seen !== undefined && isFresh(seen)) return seen.document

  try {
    const document = await fetchDiscovery(url)
    remember(url, document)
    return document
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)

    // Nothing fresh and nothing saved. This is the one case where not reaching
    // the site is fatal, and it is fatal because the CLI genuinely does not know
    // where the API is.
    if (seen === undefined) {
      throw new BootStop(
        'network_unreachable',
        `Jukebox could not read ${url}: ${cause}. There is no saved copy to fall back on, ` +
          'so it does not know where the API is.',
      )
    }

    warn(
      `Jukebox could not read ${url}: ${cause}. Using the last document it saw; ` +
        'the API address and the version gate may be out of date.',
    )

    return seen.document
  }
}
