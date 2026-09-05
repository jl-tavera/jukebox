import { BEAT, ROW, type Frame } from './boot'
import {
  BINARY,
  blank,
  COMMENT,
  decoration,
  GUTTER,
  INDENT,
  ink,
  prose,
  row,
  type Line,
} from './lines'

/**
 * The recording: four beats of a session, and the one place on this page where
 * fabricated output is allowed to appear.
 *
 * ADR-0010 states the rule this file is the exemption to -- *the page explains;
 * it never simulates* -- and states the exemption in the same breath: nothing
 * invents a Resolution, a Tier or a Track count *outside one labelled
 * recording*. So every other branch of `run` answers with the binary's own
 * generated help, and this one answers with a transcript. The label rows at
 * either end are what make that difference visible rather than a rule a reader
 * has to know.
 *
 * The fourth beat is why the ticket exists. A Sync that reports nothing changed
 * is the architecture's most distinctive property made visible -- most syncs
 * cost nothing, because the client asks with the Version it last saw and is
 * answered without a body -- and it says this is a tool somebody keeps running
 * rather than one they run once.
 *
 * **Every track, artist and album name here is invented**, which #90 requires
 * and which is worth restating where somebody might be tempted to make the demo
 * more relatable: real names on a page about downloading from open Catalogs
 * invites exactly the wrong reading of what this tool does. The Playlist id is
 * invented in the same spirit as `content.ts`'s donation addresses -- shaped
 * correctly, and reading as an example rather than as a plausible string
 * somebody might take for a Playlist they could go and open.
 *
 * **The tier cell is ahead of the binary, and that is a decision rather than an
 * oversight.** Matching runs on the worker and is not built, so nothing in
 * `cli/`, `worker/` or `schema/` carries a Tier today and `jukebox show` prints
 * six cells rather than seven. ADR-0010 permits the recording to invent one by
 * name, and #79's user story asks for it directly: a visitor should meet the
 * honest coverage story -- that `none` is a correct and common answer -- before
 * installing rather than after. Everything else here follows what the CLI
 * actually prints, byte for byte. When Matching lands, this cell stops being
 * ahead of anything and this paragraph can go.
 *
 * **There is no spinner, and #90's criterion about one is conditional for this
 * reason.** `cli/src/spinner.ts` is reached from exactly one place --
 * `cli/src/menu.ts` -- so a directly typed `jukebox add` or `jukebox sync`
 * prints no spinner at all. The recording has to show typed commands, because
 * `show` is not one of the menu's five entries, so drawing a spinner here would
 * be putting the menu's chrome on a command that never wears it. The beat after
 * each command is the pause instead.
 *
 * **Six pieces of the CLI are copied here rather than imported, and the count
 * is worth stating because copies are what this repo is most careful about.**
 * They are `columns`, `counted` and `skippedly` from `cli/src/phrasing.ts`, and
 * `performers`, `UNKNOWN` and `REMOVED_HEADING` from `cli/src/commands/show.ts`.
 * `phrasing.ts`'s own header is the argument against doing this -- those words
 * were gathered into one file precisely because *a second copy is how two
 * commands come to call the same Playlist different things*.
 *
 * **Generation was the obvious alternative and is the wrong tool here.** It is
 * what `content.ts` uses for the wordmark and the help text, and both are the
 * same shape: content the page must never disagree with the binary about, so a
 * generator writes it and CI diffs it. This is not that. It is a transcript of
 * one session, and a transcript is a fixed artifact -- generating it would mean
 * generating a *recording*, which is either a second implementation of four
 * commands or a real CLI run wired into the site's build. Neither is #90.
 *
 * **The cost, recorded rather than glossed: this can go stale and nothing will
 * say so.** If the CLI rewords `nothing changed` or moves a column, the page
 * keeps showing the old one. That is tolerable for exactly the reason the rows
 * are allowed to exist at all -- it is labelled a recording, and a recording of
 * an older version is still a recording -- but it is a real cost and not a
 * solved problem. The labelling is what keeps it honest; if that label ever
 * comes off, this paragraph is the reason it must not.
 *
 * No DOM, no timers, no clipboard. The pacing below is numbers this module
 * states and `components/live.tsx` performs, which is `boot.ts`'s arrangement
 * and what keeps the whole recording answerable under `bun test`.
 */

/** The page's own verb for all of this. `commands.ts` registers it under this name. */
export const DEMO = 'demo'

/**
 * How much a match can be trusted, in `CONTEXT.md`'s own four words.
 *
 * A union rather than a string, so a fifth word or a typo is a compiler error
 * rather than a row on a landing page saying something the glossary does not.
 * `none` is a correct and common answer, not a failure -- which is the sentence
 * the recording exists to put on screen.
 */
export type Tier = 'exact' | 'probable' | 'weak' | 'none'

/** One Track as the recording holds it. `left` is the moment it stopped being listed. */
type Recorded = {
  readonly title: string
  readonly artists: readonly string[]
  readonly album: string | null
  /** Already `m:ss`, which is what `cli/src/commands/show.ts` renders a duration as. */
  readonly duration: string
  readonly tier: Tier
  readonly left: string | null
}

/**
 * The Playlist, invented.
 *
 * The id is `spotify:` and twenty-two characters, which is the shape ADR-0001
 * specifies and what a real one looks like -- and it spells out what it is, so
 * nobody reads it as a Playlist they could go and open.
 */
const PLAYLIST = {
  title: 'Late Shift',
  id: 'spotify:0ExampleExampleExample',
  url: 'https://open.spotify.com/playlist/0ExampleExampleExample',
} as const

/** When the departed Track stopped being listed. `phrasing.ts`'s `stamp`: `YYYY-MM-DD HH:MM`. */
const LEFT_AT = '2026-08-29 21:14'

/** How many entries the Source offered that never became Tracks. */
const SKIPPED = 1

/**
 * The three that were there at the add and are there still.
 *
 * One of them has no album, so the recording shows what the CLI prints where a
 * Source said nothing: a marked gap rather than a filled-in blank.
 */
const KEPT: readonly Recorded[] = [
  {
    title: 'Harbour Lights',
    artists: ['Nell Ashgrove'],
    album: 'Tideline',
    duration: '3:52',
    tier: 'exact',
    left: null,
  },
  {
    title: 'Slow Ferry',
    artists: ['Nell Ashgrove', 'Rue Talbot'],
    album: 'Tideline',
    duration: '4:18',
    tier: 'probable',
    left: null,
  },
  {
    title: 'Cold Open',
    artists: ['Bellwether Set'],
    album: null,
    duration: '2:41',
    tier: 'weak',
    left: null,
  },
]

/**
 * The Track beat two shows arriving, and **the one that matched nothing**.
 *
 * #90 asks for at least one Track at tier `none` and this is it. That the newest
 * Track is the one with no match is the ordinary case rather than a contrived
 * one: a match has to come from an open Catalog, and the answer for a given
 * Track is often that there is not one.
 */
const ARRIVED: Recorded = {
  title: 'Nightjar',
  artists: ['Ines Okonkwo'],
  album: 'Field Notes',
  duration: '5:07',
  tier: 'none',
  left: null,
}

/** The Track beat two shows leaving. Removed, so its row is kept and gains the moment it left. */
const DEPARTED: Recorded = {
  title: 'Winter Ledger',
  artists: ['Halden Rowe'],
  album: 'Tideline',
  duration: '3:29',
  tier: 'probable',
  left: LEFT_AT,
}

/**
 * The three states the recording moves through, derived rather than counted by
 * hand.
 *
 * Every number the transcript prints comes off these, so beat one's total, beat
 * two's movement and beat three's counts cannot disagree with each other or with
 * the table -- which is exactly what a hand-written transcript gets wrong on the
 * third edit.
 */
const AT_ADD: readonly Recorded[] = [...KEPT, DEPARTED]
const HELD: readonly Recorded[] = [...KEPT, ARRIVED]
const LISTED: readonly Recorded[] = [...HELD, DEPARTED]

/**
 * What a Source did not say, marked rather than filled in.
 *
 * `cli/src/commands/show.ts`'s `UNKNOWN`. An album nobody named must not read as
 * an album called nothing.
 */
const UNKNOWN = '--'

/** `show.ts`'s heading over the Tracks a Playlist no longer lists. */
const REMOVED_HEADING = 'Removed, and still recorded here:'

/** `phrasing.ts`'s own, so `1 track` never reads `1 tracks`. */
const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** `phrasing.ts`'s own. Always said, including when it is none, so a low total never reads as loss. */
const skippedly = (skipped: number): string =>
  skipped === 0 ? 'nothing skipped' : `${counted(skipped, 'entry', 'entries')} skipped`

/** `phrasing.ts`'s `named`, and its `identified` -- what to call the Playlist in each place. */
const NAMED = `"${PLAYLIST.title}"`
const IDENTIFIED = `${NAMED} (${PLAYLIST.id})`

/** `show.ts`'s `performers`: every artist, or the gap where a Source named none. */
const performers = (artists: readonly string[]): string =>
  artists.length === 0 ? UNKNOWN : artists.join(', ')

/**
 * One Track as cells, in the order `show.ts` puts them -- plus the tier.
 *
 * The marker is first and the moment it left is last, both empty for a Track
 * still in the Playlist, which is what makes the two blocks line up when they
 * are laid out together below.
 */
const cells = (track: Recorded): string[] => [
  track.left === null ? '' : '-',
  track.title,
  performers(track.artists),
  track.album ?? UNKNOWN,
  track.duration,
  track.tier,
  track.left === null ? '' : `left ${track.left}`,
]

/**
 * `cli/src/phrasing.ts`'s `columns`, reproduced -- the largest of the six copies
 * this file makes of the CLI, and the only one whose output a literal could not
 * safely stand in for.
 *
 * A sentence is short enough that writing it out is honest. A table is not: its
 * alignment is arithmetic over the widest cell in each column, so a hand-typed
 * one drifts by a space on the first edit and looks fine while it does.
 * `content.ts` gives that reason for generating the wordmark rather than
 * retyping it, where hand-copying had already dropped a trailing space once.
 *
 * The metrics are `INDENT` and `GUTTER` from `lines.ts` rather than two more
 * string literals -- the two measurements every table on this page is built out
 * of, quoted once since #88.
 *
 * The last cell of a row is never padded and the line is trimmed, so no row
 * carries trailing whitespace. Widths are measured across every row at once,
 * which is what lets the Removed block line up with the present one instead of
 * each being square on its own.
 *
 * **`phrasing.ts`'s UTF-16 caveat is deliberately not carried over.** It records
 * that a CJK title or an emoji leans the table, because width is code units
 * rather than terminal columns. Every string here is Latin and invented, so the
 * branch it warns about is unreachable -- and copying a warning about input this
 * function cannot receive would be describing a hazard rather than having one.
 */
const columns = (rows: string[][]): string[] => {
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

/**
 * How long a row a human wrote is held.
 *
 * Longer than a printed row, so the label and the gap between the beats are read
 * rather than flashed. The three kinds of row are doing different jobs -- a
 * command has just been entered, a comment is somebody talking, and everything
 * else is output scrolling -- so there is a number per kind rather than one rate
 * for the whole thing.
 */
export const ASIDE = 400

/**
 * The longest the recording may take.
 *
 * Summed at seam one rather than measured on a clock, which is how
 * `test/boot.test.ts` holds the boot's own cap and for its reason: a wall clock
 * in a browser is measuring hydration and a loaded runner as much as the pacing.
 * It lands around 2.8s today.
 */
export const CAP = 4000

/** One row of the recording, and how long it holds before the next one. */
type Beat = { readonly line: Line; readonly hold: number }

/** A row of air. The recording never double-spaces, because the CLI never does. */
const air = (): Beat => ({ line: blank(), hold: ROW })

/**
 * A command, at the prompt the binary owns.
 *
 * `BINARY` rather than a spelled-out `$ jukebox `, and `decoration` around it for
 * `commands.ts`'s reason: the prefix is the frame the page draws rather than
 * something anybody wrote, so a screen reader walking the transcript is handed
 * the command without it.
 *
 * **These are deliberately not landable.** Every other command name on this page
 * is a word the cursor lands on, and one here would print `add`'s help into the
 * middle of a recording of `add` running -- two different screens, one of them
 * arriving because somebody clicked the other.
 *
 * It holds a beat afterwards, as if Enter had landed. Without it the command and
 * its output are one motion and the page never shows the thing it is quoting: a
 * person typing, stopping, and a program answering.
 */
const typed = (command: string): Beat => ({
  line: row(decoration(BINARY), ink(command)),
  hold: BEAT,
})

/** A row the binary printed. */
const printed = (text: string): Beat => ({ line: row(ink(text)), hold: ROW })

/**
 * A row a human wrote, in the human's face.
 *
 * `#` is the page's vernacular for exactly that -- `index.ts` sets the tagline
 * and the lede as comments for the same reason -- and it is what makes these
 * read as the page talking rather than as something the binary emitted.
 */
const aside = (text: string): Beat => ({
  line: row(decoration(`${COMMENT} `), prose(text)),
  hold: ASIDE,
})

/**
 * What says this is a recording, which #90 asks be unmistakable.
 *
 * Two rows rather than one, bracketing it, so a visitor who scrolled into the
 * middle of the transcript still finds an edge in one direction. Prose: sentence
 * case with a terminal full stop.
 */
export const OPENING = 'A recording of a session. Nothing on this page is running.'
export const CLOSING = 'The recording ends here.'

/**
 * The gap between the add and the Sync that finds something.
 *
 * **It is here because without it the recording would be lying.** `add` applies
 * the snapshot it waited for and stores the Version it applied, so a Sync run
 * straight afterwards would truthfully answer `nothing changed` -- which is the
 * answer beat four gives. Something upstream has to have moved in between, and
 * this is the row that says so.
 */
export const LATER = 'A few days later.'

/**
 * The recording, beat by beat.
 *
 * The order on screen is the order somebody would have seen it happen, and every
 * string is either quoted from the CLI function named beside it or laid out by
 * the `columns` above.
 */
const script = (): readonly Beat[] => {
  const laid = columns(LISTED.map(cells))
  const present = laid.slice(0, HELD.length)
  const gone = laid.slice(HELD.length)

  return [
    aside(OPENING),
    air(),

    // Beat one. `add.ts`'s `resolved`: the Playlist is tracked and its Tracks
    // are here. The Skipped count is always said, so a total lower than the one
    // the Source shows never has to be interpreted.
    typed(`add ${PLAYLIST.url}`),
    printed(`Tracking ${NAMED}.`),
    printed(`${counted(AT_ADD.length, 'track', 'tracks')}, ${skippedly(SKIPPED)}.`),
    air(),

    aside(LATER),
    air(),

    // Beat two. `sync.ts`'s `changed`, with the markers it writes beside a Track
    // that arrived and one that left. Only what moved is named.
    typed('sync'),
    printed(
      `${NAMED}: ${counted(1, 'track', 'tracks')} added, ${counted(1, 'track', 'tracks')} removed.`,
    ),
    printed(`${INDENT}+ ${ARRIVED.title}`),
    printed(`${INDENT}- ${DEPARTED.title}`),
    air(),

    // Beat three. `show.ts`: the Playlist, what it holds, and the two blocks of
    // Tracks laid out as one set of columns and cut in half. The status is `ok`,
    // which is the one status `show` says nothing about -- a client shows the
    // other three and leaves this one unremarked.
    typed(`show ${PLAYLIST.id}`),
    printed(IDENTIFIED),
    printed(
      `${counted(HELD.length, 'track', 'tracks')}, ${gone.length} removed, ${skippedly(SKIPPED)}.`,
    ),
    air(),
    ...present.map(printed),
    air(),
    printed(REMOVED_HEADING),
    ...gone.map(printed),
    air(),

    // Beat four, and the reason for the other three. The Version has not moved,
    // so the API answers without a body and there is nothing to apply.
    typed('sync'),
    printed(`${NAMED}: nothing changed.`),
    air(),

    aside(CLOSING),
  ]
}

/**
 * The finished transcript.
 *
 * What `demo` prints, and what a visitor who asked for reduced motion is handed
 * whole -- the same trade `boot.ts` makes, where declining the animation costs
 * no content at all.
 */
export const recording = (): readonly Line[] => script().map((beat) => beat.line)

/**
 * The recording as the frames that arrive at it.
 *
 * One frame per row, each carrying the transcript so far, so nothing ever
 * appears and then goes away. The rows are relative to the recording rather than
 * to the page: `terminal.ts` is what knows the scrollback above them and
 * prefixes it, which is also what lets the last frame hand back the very array
 * the session is holding.
 *
 * The hold on a frame belongs to the row that just landed, so the label is read
 * before anything else arrives. The last frame holds nothing, because nothing
 * follows it.
 *
 * **`after` is what a caller printed underneath the recording**, and it exists
 * because the two halves of a `Printed` must not disagree. `demo foo` answers
 * with the transcript *and* the sentence naming the words that take an argument
 * -- and with the frames covering the transcript alone, that sentence was in the
 * body, absent from every frame, and appeared only when the last frame handed
 * the whole session back. A row that pops in at the end is a row that was never
 * played. Passed through here it arrives like any other, and *every frame is a
 * prefix of the body* stays true of the argued case as well as the bare one.
 */
export const playing = (after: readonly Line[] = []): readonly Frame[] => {
  const beats = [...script(), ...after.map((line) => ({ line, hold: ROW }))]

  return beats.map((beat, index) => ({
    lines: beats.slice(0, index + 1).map((one) => one.line),
    hold: index === beats.length - 1 ? 0 : beat.hold,
  }))
}
