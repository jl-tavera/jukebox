import { describe, expect, it } from 'bun:test'
import { MENU_ENTRIES, WHAT_NEXT } from '../lib/content'
import { text, type Line, type Open, type Span } from '../lib/session/lines'
import {
  abandoned,
  answered,
  asking,
  BAR,
  BAR_END,
  LEGEND,
  moved,
  named,
  RADIO_ACTIVE,
  RADIO_INACTIVE,
  STEP,
  STEP_DONE,
  STEP_LEFT,
} from '../lib/session/select'

/**
 * The menu widget, which is the one thing on this page that is an imitation of
 * something rather than a quotation of it.
 *
 * The CLI draws its menu with `@clack/prompts`. The page cannot run that
 * library -- it writes escape sequences to a stream -- so it reproduces the
 * frame the library draws. #86 names the two details that decide whether the
 * result reads as the tool or as an impression of it, and both are asserted
 * here: the hint appears on the **active row only**, and the closing bar is a
 * **footer carrying the navigation legend**, not the last option.
 *
 * What is deliberately not reproduced is the colour. The library paints its
 * rail cyan and its active radio green; those are the library's colours, and
 * the CLI itself uses exactly one colour in the whole program and prints a
 * status as its stored word rather than as a hue. ADR-0010 settles it: the
 * shape is what identifies the widget, so the shape is copied and the palette
 * is untouched.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

const spans = (line: Line | undefined): readonly Span[] =>
  line !== undefined && line.kind === 'text' ? line.spans : []

/** The menu, as `index.ts` opens it, at whichever row the cursor is standing on. */
const menu = (cursor: number): Open => ({ message: WHAT_NEXT, options: MENU_ENTRIES, cursor })

/** The frame as the visitor first meets it: nothing chosen, the cursor at the top. */
const opened = (): Line[] => asking(menu(0))

describe('the frame the prompt library draws', () => {
  it("is built from the library's own glyphs", () => {
    // Pinned by code point, because every one of these has a lookalike that no
    // amount of reading the page would catch -- an ASCII pipe for the rail, a
    // bullet for the radio, a lower-case L for the bar end.
    expect([BAR, BAR_END, STEP, RADIO_ACTIVE, RADIO_INACTIVE]).toEqual([
      '\u2502',
      '\u2514',
      '\u25C6',
      '\u25CF',
      '\u25CB',
    ])
  })

  it('carries the legend a select shows, not the one a multiselect shows', () => {
    // The library has two. `multiselect` adds `Space: select`, and `select` --
    // which is what `cli/src/menu.ts` calls -- does not, because there is
    // nothing to toggle. Putting the longer one on the page would advertise a
    // keystroke the real menu ignores, which is exactly the imitation #86 is
    // written to prevent.
    expect(LEGEND).toBe('\u2191/\u2193 to navigate \u2022 Enter: confirm')
  })

  it('opens on a bare rail and closes on the legend and the bar end', () => {
    const drawn = rows(opened())

    expect(drawn[0]).toBe(BAR)
    expect(drawn.at(-2)).toBe(`${BAR}  ${LEGEND}`)
    expect(drawn.at(-1)).toBe(BAR_END)
  })

  it("asks the binary's question", () => {
    expect(rows(opened())[1]).toBe(`${STEP}  ${WHAT_NEXT}`)
  })
})

describe('the entries', () => {
  it("are the binary's five, in the binary's order", () => {
    // Read off `MENU_ENTRIES` rather than written out, so a reordered menu
    // retargets this test instead of passing against the wrong row. The order
    // is not alphabetical and is not arbitrary: the two that reach the network,
    // the two that read local state, then the way out.
    // Read off the spans rather than parsed back out of the rendered row. A
    // row carries its rail and its radio as decoration and its label as the
    // first thing a reader is meant to see, so the label is the first span that
    // is not hidden -- which stays true whether the row is the active one or
    // not, and does not quietly depend on both radio glyphs being one cell
    // wide.
    const labels = opened()
      .slice(2, 2 + MENU_ENTRIES.length)
      .map((line) => spans(line).find((span) => span.hidden !== true)?.text)

    expect(labels).toEqual(MENU_ENTRIES.map((entry) => entry.label))
  })

  it('shows a hint on the active row and on no other', () => {
    // The library draws a hint for the row the cursor is on and for none of the
    // rest. A page showing all five would be a page that had never watched the
    // widget it is copying.
    for (let cursor = 0; cursor < MENU_ENTRIES.length; cursor++) {
      const drawn = rows(asking(menu(cursor))).slice(2, 2 + MENU_ENTRIES.length)

      expect(drawn).toEqual(
        MENU_ENTRIES.map((entry, index) =>
          index === cursor
            ? `${BAR}  ${RADIO_ACTIVE} ${entry.label} (${entry.hint})`
            : `${BAR}  ${RADIO_INACTIVE} ${entry.label}`,
        ),
      )
    }
  })
})

describe('colour', () => {
  it('marks the chosen row by inverting it, and nothing else', () => {
    // #86: the selected row is indicated by inversion, not colour. Exactly one
    // span on the whole frame is inverted, and it is the label the cursor is
    // standing on -- every cursor-landable thing on this page is a word, and
    // this is the menu's.
    const inverted = opened()
      .flatMap((line) => spans(line))
      .filter((span) => span.tone === 'inverted')

    expect(inverted.map((span) => span.text)).toEqual([MENU_ENTRIES[0]!.label])
  })

  it('draws the rail, the radios and the legend as decoration', () => {
    // Every glyph the library would have painted cyan or green. Dim, hidden
    // from a screen reader, and carrying no meaning a reader could lose: the
    // radios differ by shape, so the active row is still the active row with
    // the colour gone.
    const frame = opened()
    const railGlyphs = frame
      .flatMap((line) => spans(line))
      .filter((span) => span.text.includes(BAR) || span.text.includes(RADIO_ACTIVE) || span.text.includes(RADIO_INACTIVE) || span.text.includes(BAR_END))

    expect(railGlyphs.length).toBeGreaterThan(0)
    expect(railGlyphs.every((span) => span.tone === 'dim' && span.hidden === true)).toBe(true)
  })
})

describe('moving the cursor', () => {
  // `findCursor` in `@clack/core` wraps in both directions -- past the end it
  // lands on the first row, before the start on the last -- and a menu of five
  // entries where the fifth is the way out is exactly where that shows: a
  // person reaching for `quit` presses up once, not four times.
  it('wraps forwards, off the last entry onto the first', () => {
    expect(moved(menu(MENU_ENTRIES.length - 1), 1).cursor).toBe(0)
  })

  it('wraps backwards, off the first entry onto the last', () => {
    expect(moved(menu(0), -1).cursor).toBe(MENU_ENTRIES.length - 1)
  })

  it('walks the rows in between', () => {
    expect(moved(menu(0), 1).cursor).toBe(1)
    expect(moved(menu(2), -1).cursor).toBe(1)
  })

  it('changes nothing else about the question', () => {
    const open = menu(0)
    const next = moved(open, 1)

    expect(next.message).toBe(open.message)
    expect(next.options).toBe(open.options)
  })
})

describe('the frame a question leaves behind', () => {
  // What the library redraws once a `select` is answered, read off its own
  // submit branch: the step's mark changes, the rail keeps one row carrying the
  // chosen label alone, and the options, the radios, the hint, the legend and
  // the corner all go. Everything below the frame is what the command printed,
  // so a legend still offering to navigate would be offering to move something
  // that is over.
  it('is the mark, the question and the row that was chosen', () => {
    expect(rows(answered(menu(1)))).toEqual([
      BAR,
      `${STEP_DONE}  ${WHAT_NEXT}`,
      `${BAR}  ${MENU_ENTRIES[1]!.label}`,
    ])
  })

  it('carries no legend, no corner and no hint', () => {
    const drawn = rows(answered(menu(0)))

    expect(drawn.some((line) => line.includes(LEGEND))).toBe(false)
    expect(drawn.some((line) => line.includes(BAR_END))).toBe(false)
    expect(drawn.some((line) => line.includes(MENU_ENTRIES[0]!.hint))).toBe(false)
  })

  it('inverts nothing, because nothing is waiting to be answered', () => {
    // The inversion is this page's cursor and the cursor has left. A frame that
    // kept it would be a widget that looks live and is not.
    const inverted = answered(menu(0))
      .flatMap((line) => spans(line))
      .filter((span) => span.tone === 'inverted')

    expect(inverted).toEqual([])
  })

  it('draws the chosen label dim, the way the library does', () => {
    const label = answered(menu(0))
      .flatMap((line) => spans(line))
      .find((span) => span.text === MENU_ENTRIES[0]!.label)

    expect(label).toEqual({ text: MENU_ENTRIES[0]!.label, tone: 'dim' })
  })
})

describe('the frame a question that was left leaves behind', () => {
  // The library's cancel, which is what Ctrl-C draws at the real menu. On the
  // page it is what a visitor typing something else does: the question was
  // never answered, and `cli/src/menu.ts` treats a cancel and `quit` as the
  // same way out, so the two frames record the same ending differently.
  it('is the mark, the question, the row that was left, and a bare rail', () => {
    expect(rows(abandoned(menu(2)))).toEqual([
      BAR,
      `${STEP_LEFT}  ${WHAT_NEXT}`,
      `${BAR}  ${MENU_ENTRIES[2]!.label}`,
      BAR,
    ])
  })

  it('strikes the row through, which is shape rather than colour', () => {
    // The library paints this mark red and strikes the value out. The red goes,
    // for the reason every other colour on this page goes; the strikethrough
    // stays, because without it an abandoned frame and an answered one differ
    // by one glyph -- and a strikethrough survives `NO_COLOR` and a terminal
    // with no palette, which is the whole test colour fails.
    const label = abandoned(menu(0))
      .flatMap((line) => spans(line))
      .find((span) => span.text === MENU_ENTRIES[0]!.label)

    expect(label).toEqual({ text: MENU_ENTRIES[0]!.label, tone: 'dim', struck: true })
  })

  it('carries no legend, no corner, no radio and no hint', () => {
    const drawn = rows(abandoned(menu(0)))

    for (const gone of [LEGEND, BAR_END, RADIO_ACTIVE, RADIO_INACTIVE, MENU_ENTRIES[0]!.hint]) {
      expect(drawn.some((line) => line.includes(gone))).toBe(false)
    }
  })

  it('inverts nothing, because nothing is waiting to be answered', () => {
    const inverted = abandoned(menu(0))
      .flatMap((line) => spans(line))
      .filter((span) => span.tone === 'inverted')

    expect(inverted).toEqual([])
  })
})

describe('naming a row', () => {
  // What makes a typed word an answer. The menu shows five words and a visitor
  // who reads them and types one means the row, not a command that happens to
  // share its spelling -- which is also the only way `quit` can mean anything
  // at a prompt where it is not a command.
  it('finds the row a word names', () => {
    expect(named(menu(0), 'config')).toBe(3)
    expect(named(menu(0), 'quit')).toBe(4)
  })

  it('answers nothing for a word no row carries', () => {
    expect(named(menu(0), 'donate')).toBeUndefined()
  })

  it('matches the label rather than what the row runs', () => {
    // #91's rows read `macos` and run something considerably longer. The word
    // on screen is the one a visitor can type, so it is the one that matches.
    const picker = {
      message: 'Which system?',
      options: [{ label: 'macos', hint: 'and linux', runs: 'install macos' }],
      cursor: 0,
    }

    expect(named(picker, 'macos')).toBe(0)
    expect(named(picker, 'install macos')).toBeUndefined()
  })
})

describe('a second caller', () => {
  /**
   * #91 opens this widget for the install command, and the ticket's word for
   * what it may do to it is *unmodified*. So this is the picker's shape --
   * another question, three rows, labels that are not what the rows run --
   * driven through every function the menu uses, with nothing added for it.
   *
   * The strings are this file's own and deliberately not #91's: the point is
   * that the widget knows nothing about who is asking, and quoting the real
   * picker would make this test something to update when that ticket lands.
   */
  const picker = (cursor: number): Open => ({
    message: 'Which system?',
    options: [
      { label: 'macos', hint: 'the curl line', runs: 'install macos' },
      { label: 'linux', hint: 'the curl line', runs: 'install linux' },
      { label: 'windows', hint: 'the powershell line', runs: 'install windows' },
    ],
    cursor,
  })

  it('gets the same frame, hint on the active row and legend in the footer', () => {
    const drawn = rows(asking(picker(1)))

    expect(drawn).toEqual([
      BAR,
      `${STEP}  Which system?`,
      `${BAR}  ${RADIO_INACTIVE} macos`,
      `${BAR}  ${RADIO_ACTIVE} linux (the curl line)`,
      `${BAR}  ${RADIO_INACTIVE} windows`,
      `${BAR}  ${LEGEND}`,
      BAR_END,
    ])
  })

  it('gets the same two endings', () => {
    expect(rows(answered(picker(2)))).toEqual([
      BAR,
      `${STEP_DONE}  Which system?`,
      `${BAR}  windows`,
    ])

    expect(rows(abandoned(picker(0)))).toEqual([
      BAR,
      `${STEP_LEFT}  Which system?`,
      `${BAR}  macos`,
      BAR,
    ])
  })

  it('wraps its own three rows', () => {
    expect(moved(picker(2), 1).cursor).toBe(0)
    expect(moved(picker(0), -1).cursor).toBe(2)
  })
})
