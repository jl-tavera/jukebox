/**
 * Everything the page says. README.md owns user-facing copy
 * (docs/design/DESIGN.md L22), so the lines marked verbatim are lifted from
 * it and must be changed there first.
 */

/**
 * The wordmark, copied byte-for-byte from the banner at the top of
 * docs/design/DESIGN.md. Generated, never hand-typed: two of these lines
 * carry trailing spaces and hand-copying has already dropped them once.
 *
 * Built entirely from Block Elements - full, half and quarter blocks
 * (U+2580-U+259F). Those glyphs fall outside a subsetted latin webfont, and
 * a per-glyph fallback with different metrics shears the art apart, which is
 * why the page uses the system monospace stack - see docs/design/SITE.md 03.
 *
 * The CLI carries the same five lines in `cli/src/wordmark.ts`, with a note
 * about terminal width where this one has a note about fonts. They are copies
 * rather than one import - #50 has the reasoning - and the two files' bytes
 * are compared in CI by `bun run --cwd cli check:wordmark`, so changing this
 * one alone fails. Change it here first, then copy it across whole. Both files
 * are pinned to LF, because the check counts columns.
 */
export const WORDMARK = `     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
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
const SITE = 'https://jukebox-site.joseluis64tavera.workers.dev'

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
