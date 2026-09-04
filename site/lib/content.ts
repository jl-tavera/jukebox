import cli from '../../cli/package.json'
import type { Option } from './session/lines'

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
 *
 * The two commands below went unread by the page for three tickets, against
 * the day #91 landed. It has: the boot offers the visitor's own line with a
 * copy control, and `install` opens a picker over all three systems.
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

/**
 * The three systems the page can hand a command to.
 *
 * Here rather than in `lib/session/install.ts`, where the picker that offers
 * them is built, because `InstallCommand` below has to name it and a leaf
 * reaching back through the module that reads it is the dependency pointing the
 * wrong way -- the reason `Open` and `Option` sit in `session/lines.ts` rather
 * than in `session/select.ts`. It is copy-deck vocabulary either way: these are
 * three words the page prints.
 */
export type System = 'macos' | 'linux' | 'windows'

export interface InstallCommand {
  /**
   * Every system this one line installs on, in the order the picker offers
   * them.
   *
   * **Three systems and two commands, and the asymmetry is the honest shape.**
   * The curl line installs on macOS and on Linux, so a visitor choosing either
   * is handed the same string -- but they are still choosing between three
   * things, because "which of these am I" is the question a person can answer
   * and "which of these two shells do I have" is not.
   *
   * It is also what the label is derived from, so a system cannot be offered by
   * the picker and left out of the row that names who the command is for.
   */
  systems: readonly System[]
  /**
   * What the active row of the picker says about this line, in the register
   * `MENU_ENTRIES`' hints use: sentence case, no full stop.
   */
  hint: string
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
 * one every other document in this repo quotes -- and since #91 that order is
 * load-bearing twice over: it is the order the picker's rows come out in, and
 * `macos` being first is what a page served to nobody in particular offers.
 * The PowerShell line is here at all -- rather than a footnote or a docs page --
 * because Windows is this project's primary environment, and a page that hands
 * over only the `curl` line excludes the visitor most likely to be reading it.
 * Both installers ship together for that reason; publishing only one would undo
 * it.
 *
 * README.md owns this copy. Change it there first.
 */
export const INSTALL_COMMANDS: readonly InstallCommand[] = [
  {
    systems: ['macos', 'linux'],
    hint: 'The curl line',
    prompt: '$',
    command: `curl -fsSL ${SITE}/install.sh | sh`,
  },
  {
    systems: ['windows'],
    hint: 'The PowerShell line',
    prompt: '>',
    command: `irm ${SITE}/install.ps1 | iex`,
  },
]

/**
 * Who a command is for, as the row above it says it.
 *
 * Derived rather than stored, which is what `systems` above bought: the label
 * and the rows the picker offers cannot disagree, because there is nothing for
 * them to disagree about. It produces `macos · linux` and `windows`, which is
 * what `docs/design/SITE.md` 04 lists as this page's platform labels.
 *
 * Here rather than beside the picker that draws it, because 04 owns the copy
 * deck and this is a string the page prints. `truncateAddress` below is the
 * same shape for the same reason.
 */
export const platforms = (command: InstallCommand): string => command.systems.join(' · ')

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
 * What the menu asks, and the five entries it offers. **Generated - do not edit
 * the question or the entries below by hand.**
 *
 * Written from `WHAT_NEXT` and `ENTRIES` in `cli/src/menu.ts` by
 * `bun run --cwd cli generate:help`, which #87 added and which the confession
 * this paragraph replaces spent three tickets promising. CI regenerates and
 * diffs, so an edit made here is an edit CI will undo: change the menu, run the
 * generator, commit what it wrote.
 *
 * This list is a *quotation of the binary's screen*, which is the whole of what
 * it is for. Its strings are the CLI's literals in the CLI's own register, so a
 * reworded hint over there moves this inside one commit rather than whenever
 * somebody next happens to read both files.
 *
 * The order is the CLI's own and is not alphabetical: the two entries that
 * reach the network, the two that read only local state, then the way out.
 * `show` and `remove` are absent there and so absent here -- both are reached
 * through `list`, where the Playlist is already on the screen.
 *
 * The menu carries the binary's entries and nothing else. `install`, `donate`
 * and `theme` are the page's own verbs and belong at the page's own prompt;
 * putting one here would be the site speaking in the binary's voice.
 *
 * **`runs` is the page's own field and not a sixth thing quoted from the CLI.**
 * ADR-0007 makes every entry a launch of a command that already exists, so this
 * is that command, and the page runs it exactly as it would have run a typed
 * one -- which is what stops an entry printing something no prompt would.
 * `quit` carries none, because the way out launches nothing; that is what
 * closes the menu and lands the visitor at the prompt. The generator derives it
 * from the entry's own value, and says so where it does.
 *
 * Four of them repeat their label today, and the repetition is the honest
 * shape rather than a redundancy to fold away: a row's word and the command it
 * launches are two facts, and #91's picker has a row reading `macos` that runs
 * something considerably longer.
 */
export const WHAT_NEXT = 'What next?'

export const MENU_ENTRIES: readonly Option[] = [
  { label: 'add', hint: 'Track a playlist', runs: 'add' },
  { label: 'sync', hint: 'Ask every playlist what changed', runs: 'sync' },
  { label: 'list', hint: 'Every playlist you track', runs: 'list' },
  { label: 'config', hint: 'Every setting, where it came from, and change one', runs: 'config' },
  { label: 'quit', hint: 'Leave the menu' },
]

export interface CliArgument {
  /**
   * As the binary's own usage line spells it: `<URL>` for one that is required,
   * `[KEY]` for one that is not.
   *
   * citty spells these and the generator carries them across without a rule of
   * its own. The page shows the same spelling here as in `usage`, rather than
   * citty's bare `URL` in its arguments table plus a `(Required)` beside the
   * description -- the brackets already say which it is, and saying it twice in
   * two notations is worse than saying it once.
   */
  name: string
  /** What the argument is, from the definition under `cli/src/commands/`. */
  description: string
}

export interface CliCommand {
  /** What is typed. The binary's own name for it, lower case. */
  name: string
  /**
   * The command's own description, and what the page's `help` puts beside its
   * name.
   *
   * **The binary's register rather than the page's**: sentence case and no
   * terminal full stop, because that is how `meta.description` is written under
   * `cli/src/commands/`. It was the page's own sentence until #87, with a full
   * stop on the end, and this is the field that handed the words back.
   */
  summary: string
  /** The usage line as the binary prints it, `[OPTIONS]` and all. */
  usage: string
  args: readonly CliArgument[]
}

/**
 * The binary's seven commands, in the binary's own words. **Generated - do not
 * edit the entries below by hand.**
 *
 * Written from the `meta` and `args` of each command under `cli/src/commands/`
 * by `bun run --cwd cli generate:help`, the way `WORDMARK` above is written
 * from `DESIGN.md`. CI regenerates and diffs, so an edit made here is an edit
 * CI will undo: change the command, run the generator, commit what it wrote.
 *
 * **These are not `MENU_ENTRIES`' hints and must not be folded into them**,
 * however alike four of them look. Both lists are quotations now, and they
 * quote two different screens: that one is what the menu draws, out of
 * `cli/src/menu.ts`, and this is what `--help` prints, out of each command's
 * own definition. `add` is three words there and twelve here, because the two
 * screens have different amounts of room and the CLI wrote for both. A merge
 * would have to throw one of them away.
 *
 * **The bend this used to record is closed.** These sentences were the page's
 * own, printed at the `$ jukebox …` prompt and set in the machine's face --
 * the page speaking where the binary should, which was written down here rather
 * than glossed, against the day #87 landed. The words are the binary's now, so
 * the voice is right and there is nothing left to concede.
 *
 * Order is `root.subCommands`' own, which is alphabetical, and which
 * `cli/test/spawned.test.ts` pins as the list `--help --json` reports. The
 * page's commands are the binary's commands in the binary's order; the question
 * this docblock used to leave open has no second answer now.
 */
export const CLI_COMMANDS: readonly CliCommand[] = [
  {
    name: 'add',
    summary: 'Start tracking a public playlist and keep a record of what is in it',
    usage: 'jukebox add [OPTIONS] <URL>',
    args: [
      { name: '<URL>', description: 'The playlist address, copied from your browser' },
    ],
  },
  {
    name: 'config',
    summary: 'Show every setting and where it came from, or set one',
    usage: 'jukebox config [OPTIONS] [KEY] [VALUE]',
    args: [
      { name: '[KEY]', description: 'The setting to change. Leave it out to show every setting' },
      { name: '[VALUE]', description: 'What to change it to' },
    ],
  },
  {
    name: 'list',
    summary: 'Show every playlist you track, with its status and what it holds',
    usage: 'jukebox list',
    args: [],
  },
  {
    name: 'remove',
    summary: 'Stop tracking a playlist on this machine and delete its local record',
    usage: 'jukebox remove [OPTIONS] <PLAYLIST>',
    args: [
      { name: '<PLAYLIST>', description: 'Its id, as `jukebox list` prints it, or the address you added it with' },
    ],
  },
  {
    name: 'show',
    summary: 'Show one playlist and the tracks recorded for it',
    usage: 'jukebox show [OPTIONS] <PLAYLIST>',
    args: [
      { name: '<PLAYLIST>', description: 'Its id, as `jukebox list` prints it, or the address you added it with' },
    ],
  },
  {
    name: 'sync',
    summary: 'Ask about every playlist you track and report what changed',
    usage: 'jukebox sync',
    args: [],
  },
  {
    name: 'version',
    summary: 'Report the version of Jukebox you are running',
    usage: 'jukebox version',
    args: [],
  },
]
