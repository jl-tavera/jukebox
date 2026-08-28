/**
 * Everything the page says. README.md owns user-facing copy
 * (docs/design/DESIGN.md L22), so the lines marked verbatim are lifted from
 * it and must be changed there first.
 */

/**
 * The wordmark, copied byte-for-byte from docs/design/DESIGN.md L4-9.
 *
 * Kept as a template literal because two lines carry trailing spaces and one
 * carries a leading space; losing them shears the letterforms. Built from box
 * drawing and block characters, which is why the page uses the system
 * monospace stack rather than a subsetted webfont - see docs/design/SITE.md 03.
 */
export const WORDMARK = `     ██╗██╗   ██╗██╗  ██╗███████╗██████╗  ██████╗ ██╗  ██╗
     ██║██║   ██║██║ ██╔╝██╔════╝██╔══██╗██╔═══██╗╚██╗██╔╝
     ██║██║   ██║█████╔╝ █████╗  ██████╔╝██║   ██║ ╚███╔╝ 
██   ██║██║   ██║██╔═██╗ ██╔══╝  ██╔══██╗██║   ██║ ██╔██╗ 
╚█████╔╝╚██████╔╝██║  ██╗███████╗██████╔╝╚██████╔╝██╔╝ ██╗
 ╚════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝`

export const INSTALL_COMMAND = 'curl -fsSL https://jukebox.dev/install.sh | sh'

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
 * Placeholders until real addresses exist.
 *
 * A crypto address sent to the wrong place is gone permanently, with no
 * recourse, so these are written in angle brackets to be unmistakable and
 * isConfigured() below keeps any unfilled row from rendering a copy button.
 * Shipping a half-filled list is therefore safe rather than dangerous.
 */
export const donations: readonly Donation[] = [
  {
    chain: 'btc',
    label: 'Bitcoin',
    address: '<paste-btc-address>',
  },
  {
    chain: 'eth',
    label: 'Ethereum',
    address: '<paste-eth-address-or-ens>',
    note: 'also base · arbitrum · optimism · polygon · usdc',
  },
  {
    chain: 'sol',
    label: 'Solana',
    address: '<paste-sol-address>',
    note: 'also usdc',
  },
  {
    chain: 'xmr',
    label: 'Monero',
    address: '<paste-xmr-address>',
  },
]

/** A placeholder is anything still wrapped in angle brackets. */
export function isConfigured(address: string): boolean {
  return !address.startsWith('<')
}

/**
 * Middle-truncate for display only. A Monero address is 95 characters and
 * fits on no phone. The full value is always what reaches the clipboard.
 */
export function truncateAddress(address: string, head = 10, tail = 6): string {
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}
