import { describe, expect, it } from 'bun:test'
import { PROMPTS, run } from '../lib/session/commands'
import { ASIDE, CAP, CLOSING, LATER, OPENING, playing, recording } from '../lib/session/demo'
import { BEAT, ROW } from '../lib/session/boot'
import { COMMENT, GUTTER, INDENT, spoken, text, type Line } from '../lib/session/lines'
import { RESTING } from '../lib/session/theme'

/**
 * The recording, and every question about it that does not need a browser.
 *
 * Seam one. What the component does with a frame is `wiring/`, and that the
 * whole thing finishes on a real clock is `e2e/demo.spec.ts`. Neither belongs
 * here.
 *
 * **Everything is pinned as a literal, and that is deliberate.**
 * `commands.test.ts` states the rule this file inherits: a sentence the *page*
 * wrote is one whose literal is the acceptance criterion, and importing the
 * module's own constant to compare against would assert nothing. Every row here
 * is the page's, because the whole file is a fabrication -- that is what #90
 * licenses and what ADR-0010 carves out. So the transcript below is written out
 * once, by hand, and a change to any character of it fails here.
 *
 * That is the opposite of `commands.test.ts`'s treatment of the binary's help,
 * which is computed from `lib/content.ts` because CI diffs that against the CLI.
 * Nothing diffs this: there is no binary run that produced it, which is exactly
 * why a reader needs a test that says what it currently says.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

const transcript = (): string[] => rows(recording())

/**
 * The recording, row for row.
 *
 * The four beats, the two label rows and the one aside, in the order somebody
 * would have seen them. The table's whitespace is what makes writing this out
 * worth the space: it is arithmetic over the widest cell in each column, and a
 * test that recomputed it would agree with a `columns` that had gone wrong.
 */
const RECORDING = [
  '# A recording of a session. Nothing on this page is running.',
  '',
  '$ jukebox add https://open.spotify.com/playlist/0ExampleExampleExample',
  'Tracking "Late Shift".',
  '4 tracks, 1 entry skipped.',
  '',
  '# A few days later.',
  '',
  '$ jukebox sync',
  '"Late Shift": 1 track added, 1 track removed.',
  '  + Nightjar',
  '  - Winter Ledger',
  '',
  '$ jukebox show spotify:0ExampleExampleExample',
  '"Late Shift" (spotify:0ExampleExampleExample)',
  '4 tracks, 1 removed, 1 entry skipped.',
  '',
  '      Harbour Lights   Nell Ashgrove               Tideline      3:52   exact',
  '      Slow Ferry       Nell Ashgrove, Rue Talbot   Tideline      4:18   probable',
  '      Cold Open        Bellwether Set              --            2:41   weak',
  '      Nightjar         Ines Okonkwo                Field Notes   5:07   none',
  '',
  'Removed, and still recorded here:',
  '  -   Winter Ledger    Halden Rowe                 Tideline      3:29   probable   left 2026-08-29 21:14',
  '',
  '$ jukebox sync',
  '"Late Shift": nothing changed.',
  '',
  '# The recording ends here.',
]

/** The four rows of the table that are still in the Playlist, and the one that left. */
const PRESENT = RECORDING.slice(17, 21)
const DEPARTED = RECORDING[23]!

describe('the recording', () => {
  it('is what it says it is, row for row', () => {
    expect(transcript()).toEqual(RECORDING)
  })

  it('computes the same recording twice', () => {
    // `session.test.ts` holds the neighbouring one, and for its reason: no
    // clock, no random, nothing hidden. A module that answered differently on a
    // second call could not be pinned above at all.
    expect(recording()).toEqual(recording())
  })
})

describe('the four beats', () => {
  /** Every command the recording shows being run, in order. */
  const commands = (): string[] =>
    transcript()
      .filter((line) => line.startsWith(PROMPTS.binary))
      .map((line) => line.slice(PROMPTS.binary.length))

  it('adds a Playlist, Syncs it, shows its Tracks, and Syncs again', () => {
    // #90's four beats, as the only four commands in the transcript. Asserted as
    // the whole list rather than by searching for each, so a fifth beat arriving
    // fails here rather than passing quietly.
    expect(commands()).toEqual([
      'add https://open.spotify.com/playlist/0ExampleExampleExample',
      'sync',
      'show spotify:0ExampleExampleExample',
      'sync',
    ])
  })

  it('ends on a Sync that reports nothing changed', () => {
    // **The beat the ticket is built around.** `sync.ts` writes two different
    // sentences on purpose -- this one is the 304, where the server sent no body
    // at all, and `no tracks added or removed` is a Version that moved for
    // something other than membership. The distinction is the whole of whether a
    // Sync cost anything, so the recording has to end on the right one.
    expect(transcript().at(-3)).toBe('"Late Shift": nothing changed.')
  })

  it('shows something changing before it shows nothing changing', () => {
    // Otherwise the fourth beat says nothing: a Sync that reports no movement is
    // only interesting after one that reported some.
    const moved = transcript().indexOf('"Late Shift": 1 track added, 1 track removed.')
    const still = transcript().indexOf('"Late Shift": nothing changed.')

    expect(moved).toBeGreaterThan(-1)
    expect(still).toBeGreaterThan(moved)
  })

  it('writes every command at the prompt the binary owns', () => {
    // ADR-0010's second rule inside the recording: these are the binary's
    // commands, so they are at the binary's prompt. `demo` itself is the page's
    // verb and is echoed at the page's, which the last case in this file pins.
    for (const line of recording()) {
      const printed = text(line)
      if (!printed.startsWith('$')) continue

      expect(printed.startsWith(PROMPTS.binary), printed).toBe(true)
    }
  })

  it('hands a screen reader the command without the prompt around it', () => {
    // The prefix is the frame the page draws rather than something anybody
    // wrote, so it is `decoration` and `spoken` drops it -- the arrangement
    // `commands.ts` uses for a real echo, and `donate.test.ts` for its own
    // sigil.
    const typed = recording().find((line) => text(line).startsWith(PROMPTS.binary))!

    expect(spoken(typed)).toBe('add https://open.spotify.com/playlist/0ExampleExampleExample')
  })
})

describe('the table', () => {
  it('lays every row on the two metrics every table on this page uses', () => {
    // `INDENT` and `GUTTER` from `lines.ts` rather than two literals here, which
    // is what #88 quoted them once for. A table that started drawing itself on
    // its own measurements would pass a hand-written expectation and disagree
    // with every other table on the page.
    for (const row of [...PRESENT, DEPARTED]) {
      expect(row.startsWith(INDENT), row).toBe(true)
      expect(row.includes(GUTTER), row).toBe(true)
    }
  })

  it('lines the Removed row up with the ones still in the Playlist', () => {
    // `show.ts` lays both blocks out as one set of columns and cuts them in half
    // afterwards, so that a reader can run an eye down the titles across the
    // gap. Measured off the titles rather than asserted about the code: every
    // row's title starts at the same column, the departed one included.
    const at = (row: string, title: string): number => row.indexOf(title)

    expect(at(PRESENT[0]!, 'Harbour Lights')).toBe(6)
    expect(at(PRESENT[1]!, 'Slow Ferry')).toBe(6)
    expect(at(PRESENT[2]!, 'Cold Open')).toBe(6)
    expect(at(PRESENT[3]!, 'Nightjar')).toBe(6)
    expect(at(DEPARTED, 'Winter Ledger')).toBe(6)
  })

  it('carries no trailing whitespace on any row', () => {
    // `columns` trims, because a reader's editor would strip it and a `toBe`
    // would then disagree. It is worth pinning of the whole transcript rather
    // than the table alone: a row with invisible slack on the end is the kind of
    // thing nobody sees until a diff shows it.
    for (const row of transcript()) {
      expect(row, JSON.stringify(row)).toBe(row.trimEnd())
    }
  })
})

describe('what the table says about matching', () => {
  it('shows a Track that matched nothing', () => {
    // **#90's first constraint on the data, and the reason ADR-0010 argues the
    // recording is worth having at all.** `CONTEXT.md`: `none` is a correct and
    // common answer, not a failure -- so a demo where everything matched would
    // be the claim the copy deck forbids, and the visitor would meet the
    // coverage story after installing rather than before.
    expect(PRESENT.some((row) => row.endsWith('none'))).toBe(true)
  })

  it('shows the other three tiers too, so `none` reads as one answer of four', () => {
    // A lone `none` among nothing else says the tool does not work. The four
    // words are `CONTEXT.md`'s and the union in `demo.ts` is what holds them to
    // it.
    expect(PRESENT.map((row) => row.split(/\s{2,}/).at(-1))).toEqual([
      'exact',
      'probable',
      'weak',
      'none',
    ])
  })

  it('marks the album nobody named rather than filling it in', () => {
    // `show.ts`'s `UNKNOWN`. An album nobody named must not read as an album
    // called nothing, and a missing duration must not read as `0:00`.
    expect(PRESENT[2]).toContain(' -- ')
  })
})

describe('the Track that left', () => {
  it('is marked, kept, and carries the moment it left', () => {
    // Removed rather than deleted: `CONTEXT.md` is explicit that the local
    // record stays and gains the moment it went, and that the word never implies
    // a file was touched. The marker is `sync`'s own, and the stamp is
    // `phrasing.ts`'s -- local time, to the minute.
    expect(DEPARTED.startsWith(`${INDENT}-`)).toBe(true)
    expect(DEPARTED).toMatch(/left \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('sits under the heading `show` puts over it', () => {
    expect(transcript()[22]).toBe('Removed, and still recorded here:')
  })

  it('is counted in what the Playlist holds', () => {
    // The counts and the table cannot disagree, because `demo.ts` derives every
    // number from the same three lists.
    expect(transcript()).toContain('4 tracks, 1 removed, 1 entry skipped.')
    expect(PRESENT).toHaveLength(4)
  })

  it('is the one the Sync above reported leaving', () => {
    // Beat two names it and beat three shows where it went. Two rows written
    // from one constant, so a rename cannot leave them naming different Tracks.
    expect(transcript()).toContain(`${INDENT}- Winter Ledger`)
    expect(DEPARTED).toContain('Winter Ledger')
  })
})

describe('the label', () => {
  it('opens and closes the recording, so it cannot be mistaken for live output', () => {
    // #90 asks that the recording be visibly labelled. Two rows rather than one,
    // bracketing it, so somebody who scrolled into the middle still finds an
    // edge.
    expect(transcript().at(0)).toBe(`${COMMENT} ${OPENING}`)
    expect(transcript().at(-1)).toBe(`${COMMENT} ${CLOSING}`)
  })

  it('is heard without the sigil the terminal draws it with', () => {
    // `donate.test.ts` pins the same pair for its warning row: `#` is the
    // page's vernacular for *a human wrote this*, it is decoration, and a screen
    // reader is handed the sentence without it.
    expect(spoken(recording()[0]!)).toBe(OPENING)
    expect(spoken(recording().at(-1)!)).toBe(CLOSING)
  })

  it('says the gap between the add and the Sync that found something', () => {
    // **Without it the recording would be lying.** `add` stores the Version it
    // applied, so a Sync run straight afterwards answers `nothing changed` --
    // which is beat four's answer. Something upstream has to have moved in
    // between, and this is the row that says so.
    expect(transcript()).toContain(`${COMMENT} ${LATER}`)
    expect(transcript().indexOf(`${COMMENT} ${LATER}`)).toBeLessThan(
      transcript().indexOf('$ jukebox sync'),
    )
  })

  it('runs nothing, anywhere in it', () => {
    // **No row of a recording is a control.** Every other command name on this
    // page is a word the cursor lands on; one here would print `add`'s help into
    // the middle of a recording of `add` running. Said of every span rather than
    // of the command rows, so a landable word cannot arrive somewhere else in
    // the transcript instead.
    const landable = recording()
      .flatMap((line) => (line.kind === 'text' ? line.spans : []))
      .filter((span) => span.runs !== undefined || span.copies !== undefined)

    expect(landable).toEqual([])
  })
})

describe('the pacing', () => {
  const frames = () => playing()
  const spent = (): number => frames().reduce((ms, frame) => ms + frame.hold, 0)

  it('plays one frame per row', () => {
    expect(frames()).toHaveLength(recording().length)
  })

  it('ends on the whole transcript', () => {
    // The counterpart to `boot.test.ts`'s own, and the property `terminal.ts`
    // then strengthens: there the last frame is the very array the session is
    // holding. Here it is the rows that array is made of.
    expect(rows(frames().at(-1)!.lines)).toEqual(RECORDING)
  })

  it('is a prefix of the transcript at every frame', () => {
    // Nothing ever appears and then goes away -- which is also why there is no
    // spinner: the only row the CLI ever removes is one it drew inside the menu,
    // and a typed command never has one.
    for (const [index, frame] of frames().entries()) {
      expect(rows(frame.lines), `frame ${index}`).toEqual(RECORDING.slice(0, index + 1))
    }
  })

  it('completes inside the cap', () => {
    // The budget, summed rather than measured, which is how `boot.test.ts` holds
    // the boot's. It lands at 2.84s today.
    expect(spent()).toBeLessThan(CAP)
  })

  it('spends its time on commands, comments and rows, and nowhere else', () => {
    // Derived rather than pinned to a magic total, so a row added to the
    // recording moves this without anybody editing a number -- while time going
    // anywhere the three constants do not account for still fails.
    const commands = RECORDING.filter((row) => row.startsWith('$')).length
    const comments = RECORDING.filter((row) => row.startsWith(COMMENT)).length
    const held = RECORDING.length - commands - comments

    // The closing label is the last row, so it holds nothing whatever its kind
    // would otherwise have cost -- which is why one comment is taken off here
    // and no row is taken off `held`.
    expect(spent()).toBe(commands * BEAT + (comments - 1) * ASIDE + held * ROW)
  })

  it('holds a beat after each command, as if Enter had landed', () => {
    for (const [index, frame] of frames().entries()) {
      if (!RECORDING[index]!.startsWith('$')) continue

      expect(frame.hold, RECORDING[index]).toBe(BEAT)
    }
  })

  it('holds a comment longer than a printed row, so it is read rather than flashed', () => {
    expect(frames()[0]!.hold).toBe(ASIDE)
    expect(ASIDE).toBeGreaterThan(ROW)
  })

  it('holds the last frame open, because nothing follows it', () => {
    expect(frames().at(-1)!.hold).toBe(0)
  })

  it('computes the same frames twice', () => {
    expect(playing()).toEqual(playing())
  })
})

describe('the verb', () => {
  it('is the page\'s own, so it is echoed at the page\'s prompt', () => {
    // The recording quotes the binary; asking for it does not. ADR-0010's rule
    // about the two vocabularies is visible in one exchange here -- a
    // `jukebox.dev` verb whose output is four `$ jukebox` commands.
    expect(text(run('demo', RESTING).echo)).toBe(`${PROMPTS.site}demo`)
  })

  it('prints the recording and asks for it to be played', () => {
    const printed = run('demo', RESTING)

    expect(rows(printed.body)).toEqual(RECORDING)
    expect(printed.plays).toEqual(playing())
  })

  it('says so when it is handed an argument, and plays anyway', () => {
    // `run`'s habit everywhere else: discarding part of what somebody typed
    // without saying so is the one thing this project's copy consistently
    // refuses. The recording is still what they asked for.
    const printed = run('demo foo', RESTING)

    expect(rows(printed.body).slice(0, RECORDING.length)).toEqual(RECORDING)
    expect(rows(printed.body).at(-1)).toContain('take an argument here.')
  })

  it('plays the whole of what it printed, leftovers included', () => {
    // **The two halves of a `Printed` must not disagree.** The leftovers used
    // to be in `body` and in no frame, so the sentence appeared only when the
    // last frame handed the session back -- a row that pops in at the end is a
    // row that was never played. Said of both cases at once, because the bare
    // one is the case that always held and the argued one is the case that did
    // not.
    for (const line of ['demo', 'demo foo']) {
      const printed = run(line, RESTING)
      const frames = printed.plays ?? []

      expect(rows(frames.at(-1)?.lines ?? []), line).toEqual(rows(printed.body))
      expect(frames, line).toHaveLength(printed.body.length)
    }
  })
})
