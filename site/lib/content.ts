import cli from '../../cli/package.json'
import type { Option } from './session/select'

/**
 * Everything the page says. README.md owns user-facing copy
 * (docs/design/DESIGN.md L22), so the lines marked verbatim are lifted from
 * it and must be changed there first.
 */

/**
 * The wordmark. **Generated - do not edit the literal below by hand.**
 *
 * Written from the banner at the top of docs/design/DESIGN.md by
 * `bun run --cwd cli generate:wordmark`, which #60 added and which SITE.md 03 had
 * described for some time before it existed. CI regenerates and diffs, so an
 * edit made here is an edit CI will undo: change the document, run the
 * generator, commit what it wrote. Two of these lines carry trailing spaces and
 * hand-copying has already dropped them once, which is the whole reason nobody
 * types this any more.
 *
 * Built entirely from Block Elements - full, half and quarter blocks
 * (U+2580-U+259F). Those glyphs fall outside a subsetted latin webfont, and a
 * per-glyph fallback with different metrics shears the art apart. That is still
 * true and is still the hazard; what changed with #81 is that the page no longer
 * avoids it by shipping no webfont. `site/scripts/build-fonts.ts` whitelists the
 * whole Block Elements range explicitly, and `check:fonts` reads the range back
 * out of the built export to prove the subset kept it - see ADR-0010.
 *
 * Two of the glyphs below appear exactly once each: U+258C and U+2590, the
 * counter of the O. They are the reason that check reads a range rather than
 * the five glyphs this art happens to use.
 *
 * The CLI is written from the same banner into `cli/src/wordmark.ts`, with a
 * note about terminal width where this one has a note about fonts - which is
 * why the generator splices the literal rather than writing the file. Both are
 * pinned to LF, and so is the document, because the generator counts columns.
 *
 * It opens with a blank row, which is #68's and is for the CLI: its header is
 * pinned to the top of a terminal and the art sat flush against the edge. Since
 * #82 the page wants it for the same reason -- the page is that terminal now --
 * so `lib/session/header.ts` promotes it into a line of the session rather than
 * dropping it. That also settles what used to be a hazard: a browser swallows a
 * newline immediately after a `<pre>` start tag, and the art handed to one no
 * longer opens with it.
 */
export const WORDMARK = `
     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
     ███ ███   ███ ███  ▄██▀ ███      ███  ▐█▌ ███▀  ▀███  ▀█████▀ 
███  ███ ███   ███ ███▀▀██▄  ███▀▀▀   ███▀▀▀█▄ ███    ███   ▄███▄  
███▄▄███ ███▄▄▄███ ███   ███ ███▄▄▄▄▄ ███▄▄▄██ ▀███▄▄███▀ ▄███▀███▄
 ▀▀▀▀▀▀   ▀▀▀▀▀▀▀  ▀▀▀   ▀▀▀ ▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀    ▀▀▀▀▀▀   ▀▀▀   ▀▀▀`

/**
 * Where the site is actually served from.
 *
 * `README.md` publishes this address and `cli/src/discovery.ts` already carries
 * the reason at length: `jukebox.dev` is registered to somebody else, so until
 * that is settled the site lives on workers.dev. `docs/design/SITE.md` 08
 * tracks it.
 *
 * Written once because three things point at it -- both install commands and
 * the discovery document the CLI reads -- and an address that disagrees with
 * itself across a landing page is the kind of thing nobody notices until
 * somebody pastes the wrong half.
 */
/**
 * The install command, which the page does not currently say.
 *
 * #82's session hands over no command; #91 is the consumer, and rebuilds this
 * behind an OS picker that copies on selection and detects the visitor's system
 * at boot. Kept for the reason the donation rows below are -- `README.md` owns
 * this string, and `SITE.md` 08 lists every place the address is written down,
 * this file first among them.
 */
const SITE = 'https://jukebox-site.joseluis64tavera.workers.dev'

/**
 * The name the page speaks under. **Not the address it is served from.**
 *
 * Those are two different facts and this file now holds both, one directly
 * above the other, so the distinction is worth stating plainly rather than
 * leaving to be worked out. `SITE` is where the bytes come from and is what an
 * install command has to name, because a visitor pastes it into a shell.
 * `HOST` is who is talking: it prefixes the page's own prompt and opens the
 * sentence a shell writes when it does not recognise a word.
 *
 * They disagree today and are meant to. `cli/src/discovery.ts` and
 * `docs/design/SITE.md` 08 both record why -- `jukebox.dev` is registered to
 * somebody else, and until that is settled the site lives on workers.dev.
 * Reading §08 and "fixing" this to match `SITE` would put a fifty-character
 * workers.dev address in front of every prompt on the page, and would break the
 * copy #85 pins by hand. When the domain is settled, `SITE` changes and this
 * does not.
 */
export const HOST = 'jukebox.dev'

export interface InstallCommand {
  /** The platforms this line is for, lower-case like the rest of the page. */
  platforms: string
  /**
   * The shell's own prompt glyph, decorative and aria-hidden. Carried per
   * command rather than fixed at the markup, because a `$` in front of a
   * PowerShell line is a small untruth on a page whose whole job is handing
   * over a command someone will paste.
   */
  prompt: string
  command: string
}

/**
 * Both of them, and the order is deliberate.
 *
 * The POSIX line is first because it is the one `README.md` leads with and the
 * one every other document in this repo quotes. The PowerShell line is here at
 * all -- rather than a footnote or a docs page -- because Windows is this
 * project's primary environment, and a page that hands over only the `curl` line
 * excludes the visitor most likely to be reading it. Both installers ship
 * together for that reason; publishing only one would undo it.
 *
 * README.md owns this copy. Change it there first.
 */
export const INSTALL_COMMANDS: readonly InstallCommand[] = [
  { platforms: 'macos · linux', prompt: '$', command: `curl -fsSL ${SITE}/install.sh | sh` },
  { platforms: 'windows', prompt: '>', command: `irm ${SITE}/install.ps1 | iex` },
]

export const hero = {
  /** README.md L3, verbatim. */
  tagline: 'Sync your playlists. Own your music.',
  /** README.md L9, verbatim. */
  lede: 'Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries.',
} as const

/**
 * The donation rows, which the page does not currently say.
 *
 * #82 replaced the hero with the terminal session and the donate dialog left
 * with it, so nothing references these today. #88 is their consumer: it prints
 * the rows into the scrollback with copy controls, and deletes the dialog for
 * good.
 *
 * Kept rather than deleted, and the distinction `SITE.md` 07 draws is why --
 * that rule is about a token or utility held as a reservation, and this is the
 * copy deck 04 owns, lifted from `README.md`, which stays its source of truth
 * whether or not a page is rendering it today.
 *
 * The addresses are the part that makes deleting the riskier move. `SITE.md` 06
 * requires each example to break its own chain's encoding, so that a wallet
 * rejects it before a send can happen; a value carrying that property is not
 * one to retype out of a diff. If #88 is dropped rather than built, delete
 * these -- a consumer that is never coming is a reservation after all.
 */
export interface Donation {
  /** Short key, shown as the row label. */
  chain: string
  /** Human name, used in accessible labels. */
  label: string
  address: string
  note?: string
}

/**
 * Flip to false once real addresses replace the examples below. Drives the
 * warning shown inside the donate modal.
 */
export const DONATIONS_ARE_EXAMPLES = true

/**
 * Example addresses, deliberately INVALID.
 *
 * A crypto address sent to the wrong place is gone permanently, with no
 * recourse. These are the right shape and length so the layout is honest,
 * but each one breaks its own chain's encoding rules - uppercase inside a
 * bech32 string, non-hex characters after 0x, base58-excluded characters
 * such as 0 and l - so a wallet rejects them before any send can happen.
 *
 * That is the safeguard: not a notice someone might skip past, but a value
 * that cannot be sent to. Replace with real addresses and set
 * DONATIONS_ARE_EXAMPLES to false.
 */
export const donations: readonly Donation[] = [
  {
    chain: 'btc',
    label: 'Bitcoin',
    address: 'bc1qEXAMPLEonlyNOTaREALaddressDOnotSEND0q4k9',
  },
  {
    chain: 'eth',
    label: 'Ethereum',
    address: '0xEXAMPLEonlyNOTaREALaddressDOnotSENDfunds0',
    note: 'also base · arbitrum · optimism · polygon · usdc',
  },
  {
    chain: 'sol',
    label: 'Solana',
    address: 'EXAMPLEonlyNOTaREALsolanaADDRESSdoNOTsend0l',
    note: 'also usdc',
  },
  {
    chain: 'xmr',
    label: 'Monero',
    address:
      '4EXAMPLEonlyNOTaREALmoneroADDRESSdoNOTsendANYfundsHEREthisISanEXAMPLEvalueONLY0000000000000000',
  },
]

/** A row still wrapped in angle brackets never renders a copy button. */
export function isConfigured(address: string): boolean {
  return !address.startsWith('<')
}

/**
 * Middle-truncate for display only. A Monero address is 95 characters and
 * fits on no phone. The full value is always what reaches the clipboard.
 */
export function truncateAddress(address: string): string {
  if (address.length <= 17) return address
  return `${address.slice(0, 10)}…${address.slice(-6)}`
}

/**
 * What the binary calls itself, read from the package the release is cut from.
 *
 * `cli/src/version.ts` does exactly this with `../package.json`, for the reason
 * it gives: `--version`, the JSON envelope and the release tag cannot disagree
 * if there is one source. The page quotes that boot, so it reads the same file
 * rather than keeping a number beside it -- a version line the site had to
 * remember to update is a version line that is wrong after the first release
 * nobody thought about.
 *
 * Inlined at prerender; this is a static export and nothing resolves it at
 * runtime. `.github/workflows/site.yml` names `cli/package.json` in its path
 * filter so that a bump runs the site's checks too.
 *
 * It does cross a workspace boundary, which `CLAUDE.md` otherwise routes
 * through `schema/`. That rule is about the contract the two surfaces share,
 * and a release number is not part of it -- it is the CLI's own identity, which
 * `schema/` has no business publishing. What the boundary is really protecting
 * against is a change on one side going unnoticed on the other, and the path
 * filter is what answers that here.
 */
export const CLI_VERSION: string = cli.version

/**
 * What the menu asks, and the five entries it offers.
 *
 * **A second copy, and CI cannot yet see the two disagree.** The originals are
 * `ENTRIES` and the `select` message in `cli/src/menu.ts`, and #87 is the
 * ticket that generates this from the CLI's own command definitions the way
 * `WORDMARK` above is already generated -- write, commit, and diff in CI. Until
 * it lands, an edited hint in the CLI leaves this stale silently, and that is a
 * known cost of building the floor before the generator rather than a shape
 * anybody should build on.
 *
 * The order is the CLI's own and is not alphabetical: the two entries that
 * reach the network, the two that read only local state, then the way out.
 * `show` and `remove` are absent there and so absent here -- both are reached
 * through `list`, where the Playlist is already on the screen.
 *
 * The menu carries the binary's entries and nothing else. `install`, `donate`
 * and `theme` are the page's own verbs and belong at the page's own prompt;
 * putting one here would be the site speaking in the binary's voice.
 */
export const WHAT_NEXT = 'What next?'

export const MENU_ENTRIES: readonly Option[] = [
  { label: 'add', hint: 'Track a playlist' },
  { label: 'sync', hint: 'Ask every playlist what changed' },
  { label: 'list', hint: 'Every playlist you track' },
  { label: 'config', hint: 'Every setting, where it came from, and change one' },
  { label: 'quit', hint: 'Leave the menu' },
]

export interface CliCommand {
  /** What is typed. The binary's own name for it, lower case. */
  name: string
  /** One line for the page's `help`. Sentence case, ending in a full stop. */
  summary: string
}

/**
 * The binary's seven commands, as the page describes them.
 *
 * **A second copy, and CI cannot yet see the two disagree** -- the same
 * confession `MENU_ENTRIES` above carries, for the same reason and with the
 * same expiry. The originals are the `meta.description` on each command under
 * `cli/src/commands/`, reachable as a list from the `commands` array
 * `cli/src/main.ts` already builds for its own `--help`. #87 generates this
 * from there and diffs it in CI, in the CLI's workflow rather than the site's.
 *
 * **These are not `MENU_ENTRIES`' hints and must not be folded into them**,
 * however alike four of them look. That list is a *quotation of the binary's
 * screen*: its strings are `cli/src/menu.ts`'s literals in the CLI's own
 * register, and if the CLI reworded a hint tomorrow that list would have to
 * follow to stay a faithful quotation. This list is the page's own wording --
 * sentence case, terminal full stop -- and it would not have to move.
 * Collapsing them saves five strings and costs the distinction that makes the
 * quotation mean anything.
 *
 * **Written by the page, printed in the binary's voice, and that is the one
 * place ADR-0010's rule bends.** A summary answers at the `$ jukebox …` prompt
 * and is set in the machine's face, so for as long as these sentences are ours
 * the page is speaking where the binary should. The alternative was to print
 * them as `prose`, which trades the bend for a worse one: the same string would
 * change typeface between here and the `help` column, and would change back
 * when #87 lands. #87 is what actually resolves it -- these become the
 * command's own generated help, at which point the words are the binary's and
 * the voice is correct. Recorded rather than glossed, because a reader
 * comparing this against the ADR deserves to find the discrepancy already
 * known.
 *
 * Order is the menu's for the five it carries, then the two reached through
 * `list`, then `version`. Not alphabetical, and not the tree's own order
 * either: `cli/src/root.ts` lists them alphabetically because an object literal
 * has to be in some order, which is not the same as choosing one. #87 settles
 * this when it generates.
 *
 * Every summary here prints as-is today. #87 replaces it with the command's
 * real generated help; what the page does with the string does not change, only
 * how long it is.
 */
export const CLI_COMMANDS: readonly CliCommand[] = [
  { name: 'add', summary: 'Track a playlist.' },
  { name: 'sync', summary: 'Ask every playlist what changed.' },
  { name: 'list', summary: 'Every playlist you track.' },
  { name: 'config', summary: 'Every setting, where it came from, and change one.' },
  { name: 'show', summary: 'One playlist, and the tracks recorded for it.' },
  { name: 'remove', summary: 'Stop tracking a playlist on this machine.' },
  { name: 'version', summary: 'Report the version of Jukebox you are running.' },
]
