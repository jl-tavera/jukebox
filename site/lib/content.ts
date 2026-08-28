/**
 * Every string on the page, plus the ledger sample.
 *
 * README.md is the source of truth for user-facing copy
 * (docs/design/DESIGN.md L22). Anything marked verbatim below is lifted
 * from it and must be changed there first. See docs/design/SITE.md 04.
 */

export const REPO_URL = 'https://github.com/jl-tavera/jukebox'

export const INSTALL_COMMAND = 'curl -fsSL https://jukebox.dev/install.sh | sh'

export const hero = {
  eyebrow: 'Open-source CLI · Spotify first',
  /** README.md L3, verbatim. */
  headline: ['Sync your playlists.', 'Own your music.'],
  /** README.md L9, verbatim. */
  lede: 'Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries.',
  /** README.md L11, condensed. */
  sub: 'You give it a playlist URL. It keeps a local folder in sync as the playlist changes — new tracks get downloaded, removed tracks get flagged.',
  /** README.md L13, condensed. */
  sources: 'Spotify first. Apple Music and YouTube later.',
} as const

export type Tier = 'exact' | 'probable' | 'weak' | 'none'

export interface LedgerRow {
  /** Playlist position. The {nn} in the organize template, DESIGN.md 06. */
  n: string
  title: string
  artist: string
  tier: Tier
  match?: {
    catalog: string
    title: string
    artist: string
  }
}

/**
 * Illustrative only. Every title and artist here is invented for this
 * example — no real recording or performer appears, because the page
 * would otherwise be asserting a catalog relationship and a match score
 * that nobody computed. See docs/design/SITE.md 03.
 *
 * The balance is deliberate: most rows resolve to `none`, which is the
 * honest shape of a real playlist against open catalogs (DESIGN.md 04).
 */
export const ledger: readonly LedgerRow[] = [
  {
    n: '01',
    title: 'Tin Ceiling',
    artist: 'Vera Sound',
    tier: 'exact',
    match: { catalog: 'Jamendo', title: 'Tin Ceiling', artist: 'Vera Sound' },
  },
  { n: '02', title: 'Paper Boats', artist: 'Ash Mallory', tier: 'none' },
  {
    n: '03',
    title: 'Drift Meridian',
    artist: 'Nils Katt',
    tier: 'probable',
    match: { catalog: 'ccMixter', title: 'Drift (Meridian edit)', artist: 'N. Katt' },
  },
  { n: '04', title: 'Half Light Radio', artist: 'Juno Field', tier: 'none' },
  {
    n: '05',
    title: 'Slow Wire',
    artist: 'Ora & Vane',
    tier: 'exact',
    match: { catalog: 'Free Music Archive', title: 'Slow Wire', artist: 'Ora and Vane' },
  },
  { n: '06', title: 'Kestrel Season', artist: 'Halden Moss', tier: 'none' },
  {
    n: '07',
    title: 'Meridian Bell',
    artist: 'Cass Ivor',
    tier: 'weak',
    match: { catalog: 'Internet Archive', title: 'Meridian Bell (live)', artist: 'Cass Ivor' },
  },
  { n: '08', title: 'Nightjar Étude', artist: 'Marta Vell', tier: 'none' },
  { n: '09', title: 'Sable Morning', artist: 'Iver Quist', tier: 'none' },
]

export const ledgerCopy = {
  eyebrow: 'Example — one playlist, resolved',
  heading: 'The match ledger',
  caption:
    "Most tracks won't match. That's not a bug — open catalogs don't hold commercial recordings, and Jukebox never pretends otherwise.",
} as const

/** README.md L27–31, verbatim. */
export const concerns = [
  {
    name: 'Resolution',
    does: 'Playlist URL → normalized track list',
    where: 'Backend',
  },
  {
    name: 'Matching',
    does: 'Track → candidate in an open catalog',
    where: 'Backend',
  },
  {
    name: 'Fetching',
    does: 'Download, verify, organize, reconcile',
    where: 'Client',
  },
] as const

/** CLAUDE.md L3, DESIGN.md L158. */
export const catalogs = [
  'Jamendo',
  'Free Music Archive',
  'Internet Archive',
  'ccMixter',
  'Musopen',
] as const

/** DESIGN.md 10 — lead-ins verbatim. */
export const nonGoals = [
  {
    claim: 'Not a Spotify / Apple Music / YouTube downloader.',
    gloss:
      'Jukebox matches playlist entries to openly licensed equivalents. It never downloads from the playlist source.',
  },
  {
    claim: 'No DRM circumvention.',
    gloss:
      'Not a compromise position. The architecture has no path to protected content, and no feature that would need one gets added.',
  },
  {
    claim: 'No accounts.',
    gloss:
      'The playlist URL is the identity. Nothing about a response depends on who is asking, which is why everything caches globally.',
  },
  {
    claim: 'No inflated match rates.',
    gloss:
      'Coverage is a property of the open catalogs. Loosening the license check to improve the number would break the premise.',
  },
] as const
