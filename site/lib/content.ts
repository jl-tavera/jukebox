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
