import { GUTTER, INDENT } from './lines'

/**
 * The machine the shell is running on, invented -- #113.
 *
 * **This is the half ADR-0010 forbade.** That record's first rule is *the page
 * explains; it never simulates*, and `docs/design/SITE.md` 07 puts it stricter
 * still: *nothing on the page invents a Resolution, a Tier, a Track list or a
 * match rate*. A Library of Playlist folders and a Mirror recording what is in
 * them is a Track list, plainly, and this file is it. #114 is the ADR that
 * supersedes 0010 and records why it is now allowed; it is blocked by this
 * ticket, so the invention lands first and the record follows. That order is
 * the two tickets' own and is not an oversight here.
 *
 * **What the exemption costs is a rule instead of a reviewer.** Everything else
 * the terminal prints is either the binary's own words -- generated into
 * `lib/content.ts` and diffed by `cli.yml` -- or the page's own copy. This is
 * neither, so `test/machine.test.ts` reads `CONTEXT.md` and holds every domain
 * word here to it, in both directions: a term used must be one the glossary
 * grants, and no synonym the glossary avoids may appear at all.
 *
 * **Every Playlist, Track, artist and album name below is invented**, which the
 * deleted `demo.ts` required for a reason worth restating: real names on a page
 * about downloading from open Catalogs invites exactly the wrong reading of
 * what this tool does. Two families, both already in this repo rather than
 * newly made up -- `Late Shift` is the recording #112 deleted, recoverable at
 * `git show ffb4d74~1:site/lib/session/demo.ts`, and `Rain / Shine` is
 * `README.md`'s own worked example, so a visitor who reads the docs next finds
 * the same Playlist there.
 *
 * Pure, and it stays pure: no DOM, no emulator, no `just-bash`. It is a map of
 * paths to strings and `components/live.tsx` is what hands it to a shell.
 * `tsconfig.test.json` enforces the first; the second is the boundary
 * `session/shell.ts` states for the whole directory.
 */

/**
 * The two names `CONTEXT.md` keeps apart, and the reason this file needs both.
 *
 * The ticket says "mirror" for all of it. The glossary does not, and the split
 * is load-bearing here rather than pedantic:
 *
 * - The **Library** is *"the user's local folder of downloaded audio"*. That is
 *   the folder-per-Playlist tree below, at `library_path` -- ADR-0004's layout,
 *   defaulting to a `Jukebox` folder in the platform's music directory.
 * - The **Mirror** is *"the client's local record of the Playlists a user
 *   tracks and the Tracks in them"*. It is the only thing that holds a Match,
 *   so it is the only thing that can carry a Tier.
 *
 * A Library alone could not satisfy the ticket's own criterion that a Track
 * shows tier `none`, because a Tier is not a property of a file. Both are
 * seeded, each under its own name.
 */
export const HOME = '/home/user'

/** ADR-0004's root. `cli/src/paths.ts` builds this one on Linux, and the shell is Linux-shaped. */
export const LIBRARY = `${HOME}/Music/Jukebox`

/**
 * Where Jukebox keeps its own two directories, relocated -- and the reason the
 * Mirror is somewhere a visitor will actually find it.
 *
 * **Left at its default, the Mirror is unreachable on this page.**
 * `cli/src/paths.ts` puts the data directory at `$XDG_DATA_HOME` or
 * `~/.local/share/jukebox` on Linux, which is a dot-directory: `ls ~` does not
 * show it, and nothing the page prints names the path. The one Track at tier
 * `none` is the whole reason this invention is allowed to exist -- it is the
 * page's only honest sentence about coverage -- and a record nobody can find
 * makes that sentence unsayable rather than merely quiet.
 *
 * `JUKEBOX_HOME` is the CLI's own answer and needs no invention to use.
 * `README.md`: *"`JUKEBOX_HOME` relocates Jukebox's own two directories at
 * once, which is useful for trying it out without touching anything."* Trying
 * it out is exactly what this machine is doing, so it is set, and
 * `components/live.tsx` puts the same value in the shell's environment -- a
 * visitor who wonders why the folder is there can run `env` and be told.
 *
 * `locations()` reads that one variable and answers `{relocated}/config` and
 * `{relocated}/data`, which is why the Mirror sits two levels down rather than
 * at the root of it. There is no `config` directory here because nothing
 * created one: ADR-0004's 2026-09-01 amendment is explicit that **only what the
 * user chose is written down**, and a visitor who changed no setting has no
 * configuration file. The Library is untouched by any of this -- `JUKEBOX_HOME`
 * deliberately does not move it, because that folder is the user's own.
 */
export const RELOCATED = `${HOME}/jukebox`

const DATA = `${RELOCATED}/data`

export const MIRROR = `${DATA}/mirror`

/**
 * How much a match can be trusted, in `CONTEXT.md`'s own four words.
 *
 * A union rather than a string, so a fifth word or a typo is a compiler error
 * rather than a row on a landing page saying something the glossary does not.
 *
 * **This is ahead of the binary and that is a decision, not an oversight.**
 * Matching runs on the worker and is not built: nothing in `cli/`, `worker/` or
 * `schema/` carries a Tier today, and `jukebox show` prints six cells rather
 * than seven -- `cli/src/commands/show.ts`'s HEADINGS has no room for one. The
 * deleted recording invented the same cell and said the same thing about it.
 * When Matching lands, the column stops being ahead of anything and this
 * paragraph can go.
 */
type Tier = 'exact' | 'probable' | 'weak' | 'none'

/** One Track as the Mirror holds it. */
type Recorded = {
  readonly title: string
  readonly artists: readonly string[]
  readonly album: string | null
  /** Already `m:ss`, which is what `cli/src/commands/show.ts` renders a duration as. */
  readonly duration: string
  readonly tier: Tier
  /** The moment the Source stopped listing it, or `null` while it is still listed. */
  readonly left: string | null
  /**
   * What is in the Playlist's folder for it, or `null` where there is nothing.
   *
   * **The gap between this and the record is the whole coverage story**, and it
   * is the one thing on this page a visitor works out by looking rather than by
   * being told. A Track at tier `none` has no Catalog Item, so there was
   * nothing to download and the folder holds no file -- `ls` counts one fewer
   * than the record does, and the record says why.
   *
   * A Removed Track keeps its file, because `CONTEXT.md` is explicit that the
   * word *"never implies a file was deleted"*.
   */
  readonly file: string | null
}

type Tracked = {
  readonly title: string
  /** What ADR-0004's rules make of the title. `Rain / Shine` loses its slash and the space it left. */
  readonly folder: string
  readonly skipped: number
  /** `phrasing.ts`'s `stamp`: `YYYY-MM-DD HH:MM`. When this copy last moved, not when it last asked. */
  readonly updated: string
  readonly tracks: readonly Recorded[]
}

/**
 * The Playlist the deleted recording used, carrying all four Tiers.
 *
 * `Nightjar` is the one at `none` and the reason this Playlist is here. That
 * the newest Track is the one that matched nothing is the ordinary case rather
 * than a contrived one: a match has to come from an open Catalog, and the
 * answer for a given Track is often that there is not one.
 *
 * `Winter Ledger` is Removed and its file is still in the folder. Its filename
 * carries no number, which is not a naming scheme -- a Removed Track has a
 * position and no number, and numbers move when membership does, so a number in
 * a filename is stale the moment anything leaves. ADR-0004's 2026-09-05
 * amendment refuses to compute filenames for exactly this family of reasons and
 * leaves DESIGN 11's template **Proposed**; nothing here decides it either. The
 * numbered names below are what `cli/test/open.test.ts` already puts on disk.
 */
const LATE_SHIFT: Tracked = {
  title: 'Late Shift',
  folder: 'Late Shift',
  skipped: 1,
  updated: '2026-08-29 21:14',
  tracks: [
    {
      title: 'Harbour Lights',
      artists: ['Nell Ashgrove'],
      album: 'Tideline',
      duration: '3:52',
      tier: 'exact',
      left: null,
      file: '01 - Harbour Lights.mp3',
    },
    {
      title: 'Slow Ferry',
      artists: ['Nell Ashgrove', 'Rue Talbot'],
      album: 'Tideline',
      duration: '4:18',
      tier: 'probable',
      left: null,
      file: '02 - Slow Ferry.mp3',
    },
    {
      // No album, so the record shows what the CLI prints where a Source said
      // nothing: a marked gap rather than a filled-in blank.
      title: 'Cold Open',
      artists: ['Bellwether Set'],
      album: null,
      duration: '2:41',
      tier: 'weak',
      left: null,
      file: '03 - Cold Open.mp3',
    },
    {
      title: 'Nightjar',
      artists: ['Ines Okonkwo'],
      album: 'Field Notes',
      duration: '5:07',
      tier: 'none',
      left: null,
      file: null,
    },
    {
      title: 'Winter Ledger',
      artists: ['Halden Rowe'],
      album: 'Tideline',
      duration: '3:29',
      tier: 'probable',
      left: '2026-08-29 21:14',
      file: 'Winter Ledger.mp3',
    },
  ],
}

/**
 * `README.md`'s own worked example, so the page and the docs agree.
 *
 * Its title carries a slash, which is what makes the folder worth showing:
 * ADR-0004 drops the character rather than replacing it, and collapses the
 * whitespace the removal leaves -- so `Rain / Shine` is filed under
 * `Rain Shine`. A visitor who wonders why the two disagree has found a real
 * rule rather than a typo.
 *
 * The Tiers are invented; `README.md` has no column for them.
 */
const RAIN_SHINE: Tracked = {
  title: 'Rain / Shine',
  folder: 'Rain Shine',
  skipped: 1,
  updated: '2026-08-31 21:29',
  tracks: [
    {
      title: 'Long Way Down',
      artists: ['Aria Fenn', 'Kit Marlow'],
      album: 'Ninety Miles',
      duration: '4:02',
      tier: 'exact',
      left: null,
      file: '01 - Long Way Down.mp3',
    },
    {
      title: 'Sun Dogs',
      artists: ['Aria Fenn'],
      album: 'Ninety Miles',
      duration: '2:58',
      tier: 'probable',
      left: null,
      file: '02 - Sun Dogs.mp3',
    },
    {
      title: 'Blue Dot',
      artists: ['Aria Fenn'],
      album: 'Ninety Miles',
      duration: '3:34',
      tier: 'exact',
      left: '2026-08-31 21:29',
      file: 'Blue Dot.mp3',
    },
  ],
}

const TRACKED: readonly Tracked[] = [LATE_SHIFT, RAIN_SHINE]

/**
 * Six pieces of the CLI's own phrasing, copied rather than imported.
 *
 * `site/` does not depend on `cli/`, so there is no import to make. The deleted
 * recording made the same six copies and argued the trade at length: those
 * words were gathered into `cli/src/phrasing.ts` precisely because a second copy
 * is how two commands come to call the same Playlist different things, and this
 * is a third. What makes it tolerable is that these are the shapes a record of
 * a session has, and the record is a fixed artifact either way.
 */
const UNKNOWN = '--'
const REMOVED_MARK = '-'
const REMOVED_HEADING = 'Removed, and still recorded here:'

const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

const performers = (artists: readonly string[]): string =>
  artists.length === 0 ? UNKNOWN : artists.join(', ')

/** Always said, including when it is none, so a total lower than the Source's never reads as loss. */
const skippedly = (skipped: number): string =>
  skipped === 0 ? 'nothing skipped' : `${counted(skipped, 'entry', 'entries')} skipped`

const held = (tracks: number, removed: number): string =>
  tracks === 0 && removed === 0
    ? 'no tracks'
    : counted(tracks, 'track', 'tracks') + (removed === 0 ? '' : `, ${removed} removed`)

/**
 * `cli/src/phrasing.ts`'s `columns`, reproduced -- the largest of the copies and
 * the only one a literal could not safely stand in for.
 *
 * A sentence is short enough that writing it out is honest. A table is not: its
 * alignment is arithmetic over the widest cell in each column, so a hand-typed
 * one drifts by a space on the first edit and looks fine while it does.
 * `content.ts` gives that reason for generating the wordmark rather than
 * retyping it, where hand-copying had already dropped a trailing space once.
 *
 * The metrics are `INDENT` and `GUTTER` from `lines.ts` -- the two measurements
 * every table on this page is built out of, quoted once. The last cell of a row
 * is never padded and the line is trimmed, so no row carries trailing
 * whitespace, and widths are measured across every row at once, which is what
 * lets the Removed block line up with the present one.
 */
const columns = (rows: readonly (readonly string[])[]): string[] => {
  const widths: number[] = []

  for (const row of rows) {
    row.forEach((cell, at) => {
      widths[at] = Math.max(widths[at] ?? 0, cell.length)
    })
  }

  return rows.map((cells) =>
    (
      INDENT +
      cells
        .map((cell, at) => (at === cells.length - 1 ? cell : cell.padEnd(widths[at]!)))
        .join(GUTTER)
    ).trimEnd(),
  )
}

/** Present Tracks and departed ones, split the way `show` prints them. */
const present = (playlist: Tracked): readonly Recorded[] =>
  playlist.tracks.filter((track) => track.left === null)

const departed = (playlist: Tracked): readonly Recorded[] =>
  playlist.tracks.filter((track) => track.left !== null)

/**
 * One Playlist, as `jukebox show` prints it -- plus the Tier.
 *
 * The cells and their order are `cli/src/commands/show.ts`'s, and so is the
 * summary line above them and the Removed block below. `README.md` 91 quotes
 * the same output, which is the copy this is checked against by eye.
 *
 * The `#` column holds a Track number for a Track the Playlist still holds and
 * `REMOVED_MARK` for one it does not, because a Removed Track has a position
 * and no number. Numbers count what is on screen rather than the Source's own
 * positions, which carry gaps wherever an entry was Skipped.
 */
const shown = (playlist: Tracked): string => {
  const kept = present(playlist)
  const gone = departed(playlist)

  const cells = (track: Recorded, mark: string): readonly string[] => [
    mark,
    track.title,
    performers(track.artists),
    track.album ?? UNKNOWN,
    track.duration,
    track.tier,
    track.left === null ? '' : `left ${track.left}`,
  ]

  const rows = columns([
    ['#', 'TITLE', 'ARTIST', 'ALBUM', 'TIME', 'TIER', ''],
    ...kept.map((track, at) => cells(track, String(at + 1))),
    ...gone.map((track) => cells(track, REMOVED_MARK)),
  ])

  const heading = rows[0]!
  const listed = rows.slice(1, kept.length + 1)
  const removed = rows.slice(kept.length + 1)

  return [
    `"${playlist.title}"`,
    `${held(kept.length, gone.length)}, ${skippedly(playlist.skipped)}.`,
    '',
    heading,
    ...listed,
    ...(removed.length === 0 ? [] : ['', REMOVED_HEADING, ...removed]),
    '',
  ].join('\n')
}

/**
 * Every Playlist tracked, as `jukebox list` prints it.
 *
 * No heading row, which is `list`'s own shape rather than an omission -- four
 * columns whose contents name themselves. The last one says *updated* rather
 * than *synced* deliberately: a Sync that finds nothing changed costs nothing
 * and writes nothing, so the timestamp is when this copy last moved.
 *
 * Both rows read `ok`, which `CONTEXT.md` calls *"the ordinary state, and the
 * only one that says nothing about a problem"*.
 */
const listed = (): string =>
  `${columns(
    TRACKED.map((playlist) => [
      `"${playlist.title}"`,
      'ok',
      held(present(playlist).length, departed(playlist).length),
      `updated ${playlist.updated}`,
    ]),
  ).join('\n')}\n`

/**
 * Every domain word the invented half puts on a screen, declared.
 *
 * **Exported so that `test/machine.test.ts` has something exact to check**,
 * rather than scanning the text for words that look like domain terms and
 * guessing at what it is holding. The test asserts both directions: every word
 * here is one `CONTEXT.md` grants, and every word here actually appears in
 * something seeded below. A term added to a record without being added here
 * fails the second the moment somebody notices; a term here that nothing prints
 * fails immediately.
 *
 * `library` is deliberately absent. The folder tree *is* the Library, and the
 * word for it is nowhere on the screen, because the CLI does not print it
 * either -- `jukebox config` names `library_path` and nothing else does.
 */
/**
 * Every invented name the records put on screen, derived rather than relisted.
 *
 * **This exists so the glossary check can read the seeded text rather than a
 * list of words somebody remembered to keep current.** Holding `TERMS` to
 * `CONTEXT.md` proves the declared vocabulary is granted; it proves nothing
 * about a word that reached a record without being declared. Subtracting these
 * from the actual text is what leaves the domain words behind to be checked --
 * a Playlist title is not a term and must not have to be one.
 *
 * Derived from `TRACKED` so a Track added below cannot smuggle a name past the
 * check by not being written down here too.
 */
export const INVENTED: readonly string[] = TRACKED.flatMap((playlist) => [
  playlist.title,
  playlist.folder,
  ...playlist.tracks.flatMap((track) => [track.title, ...track.artists, track.album ?? '']),
]).filter((name) => name !== '')

export const TERMS: readonly string[] = [
  'playlist',
  'track',
  'title',
  'artist',
  'album',
  'tier',
  'mirror',
  'removed',
  'skipped',
  'ok',
  'exact',
  'probable',
  'weak',
  'none',
]

/**
 * The whole invented half, as paths to contents.
 *
 * **Effectively read-only, and worth knowing why.** `@wterm/just-bash` runs
 * every entered line twice -- once for its output and once more with
 * `>/dev/null 2>&1; pwd` appended, to find out whether the line was a `cd`. A
 * read is unaffected and so is `>`, which writes the same bytes both times;
 * `>>` would append twice. Nothing here depends on that, and a later writer
 * reaching for a command that mutates the tree should know it happens twice.
 *
 * **The audio files are empty**, because the page ships no audio and a landing
 * page inventing bytes that claim to be a recording would be a different and
 * worse kind of invention. What matters about them is that they are there, in a
 * folder named after a Playlist, with a name holding a Track's title -- which
 * is exactly the three answers `jukebox open` joins together.
 *
 * No entry is a directory. `InitialFiles` is a map of files and `InMemoryFs`
 * creates the parents it needs, so a directory with nothing in it cannot be
 * expressed and every folder here earns its existence from a file inside it.
 */
export const MACHINE: Record<string, string> = {
  [`${MIRROR}/playlists.txt`]: listed(),
  ...Object.fromEntries(
    TRACKED.map((playlist) => [`${MIRROR}/${playlist.folder}.txt`, shown(playlist)]),
  ),

  ...Object.fromEntries(
    TRACKED.flatMap((playlist) =>
      playlist.tracks
        .filter((track) => track.file !== null)
        .map((track) => [`${LIBRARY}/${playlist.folder}/${track.file}`, '']),
    ),
  ),
}
