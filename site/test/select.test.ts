import { describe, expect, it } from 'bun:test'
import { MENU_ENTRIES, WHAT_NEXT } from '../lib/content'
import { text, type Line, type Span } from '../lib/session/lines'
import { BAR, BAR_END, LEGEND, RADIO_ACTIVE, RADIO_INACTIVE, select, STEP } from '../lib/session/select'

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

/** The frame as the visitor first meets it: nothing chosen, the cursor at the top. */
const opened = (): Line[] => select(WHAT_NEXT, MENU_ENTRIES, 0)

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
      const drawn = rows(select(WHAT_NEXT, MENU_ENTRIES, cursor)).slice(2, 2 + MENU_ENTRIES.length)

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
