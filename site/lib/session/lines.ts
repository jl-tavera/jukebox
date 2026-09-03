/**
 * What a session is made of.
 *
 * The page is a terminal, so the vocabulary is a terminal's: rows of text, and
 * the blank rows between them. Everything the visitor sees is one of the three
 * `Line` kinds below, computed here and written by exactly one renderer --
 * which is the shape `cli/src/render.ts` already has, adopted for the reason
 * ADR-0010 gives: the site becomes testable the way the CLI is.
 */

/**
 * The five-step ladder #79 fixes, minus the steps nothing has asked for yet.
 *
 * Hierarchy on this page comes from weight and colour, never from size -- there
 * is one text size across the whole page and the wordmark is the only
 * exception. `bold` is the fifth step and is deliberately absent: nothing in
 * the finished session renders in it, and `docs/design/SITE.md` 07 deletes a
 * token nothing references rather than keeping it as a reservation. It arrives
 * with its first consumer.
 *
 * `prose` is the human's voice against the machine's -- the tagline and the
 * lede, which a person wrote. Today both faces resolve to the same stack; #81
 * vendors Monaspace Argon behind `prose` and Neon behind the rest, and this is
 * the only place that has to know.
 */
export type Tone = 'inverted' | 'ink' | 'prose' | 'dim'

/**
 * A run of text in one tone.
 *
 * `hidden` marks decoration -- a rail glyph, the `#` on a comment, the `$` on a
 * prompt. It is what a terminal draws and not what it says, so a screen reader
 * is better off without it. It is a rendering hint and nothing more: `text`
 * below joins hidden spans with the rest, because the terminal prints them.
 */
export type Span = { text: string; tone: Tone; hidden?: true }

/**
 * One row of the session.
 *
 * **There is no indent field, and there must not be one.** A horizontal offset
 * is a space character inside `text`, exactly as a terminal emits one, which is
 * what makes #82's "every horizontal offset is a whole character" true by
 * construction rather than by reviewing a stylesheet.
 *
 * `blank` is a kind of its own rather than a row with no spans, for the
 * matching reason on the other axis: it is the page's only vertical spacing
 * mechanism, so "every vertical gap is zero or one line" is a property of this
 * list that a test can read, and there is no margin anywhere to disagree with
 * it.
 *
 * `art` is separate because the wordmark is the one thing that must not wrap
 * and the one thing with a size of its own. It is also the only line that
 * becomes a `<pre>`.
 */
export type Line =
  | { kind: 'blank' }
  | { kind: 'text'; spans: readonly Span[] }
  | { kind: 'art'; text: string; label: string }

/**
 * Something the page must do that this module may not.
 *
 * Writing to a clipboard, moving focus and scheduling a timer are not
 * expressible as a pure function of state, so they leave here as a declaration
 * and the component performs them. ADR-0010 asks for this in order to make
 * `SITE.md` 06's existing rule satisfiable without a browser -- *verify by
 * capturing the argument to `clipboard.writeText`, not by eye* -- and capturing
 * an intent is how a test does that with no clipboard in the room.
 *
 * One member, because one is what is needed to keep the array widenable: a
 * `readonly never[]` cannot gain a member without editing the type every later
 * ticket depends on. The finished session declares none of these; #88 and #91
 * are the first to emit one.
 */
export type Intent = { kind: 'copy'; value: string; what: string }

/** What the module computes and the renderer is handed. Nothing else crosses. */
export type Session = { lines: readonly Line[]; intents: readonly Intent[] }

/**
 * The constructors, which exist so that composing a session reads like the
 * screen it describes -- `row(decoration('$ '), ink('jukebox'))` rather than
 * four object literals a reader has to decode back into a line.
 *
 * One per step of the ladder above, and no way to build a `Span` without
 * naming one: a tone is the whole of what a span decides, so a constructor
 * that took one as an argument would only be the object literal again.
 */
export const blank = (): Line => ({ kind: 'blank' })

export const row = (...spans: Span[]): Line => ({ kind: 'text', spans })

export const ink = (text: string): Span => ({ text, tone: 'ink' })
export const dim = (text: string): Span => ({ text, tone: 'dim' })
export const prose = (text: string): Span => ({ text, tone: 'prose' })
export const inverted = (text: string): Span => ({ text, tone: 'inverted' })

/**
 * A glyph the terminal draws rather than says: the rail, a radio, a sigil.
 *
 * Always dim, because none of it is content, and always hidden, because a
 * screen reader reading the rail out would be reading the frame instead of the
 * picture. One constructor rather than a flag on each of the four above, since
 * decoration on this page is never any other tone.
 */
export const decoration = (text: string): Span => ({ text, tone: 'dim', hidden: true })

/**
 * One line as the terminal would have printed it.
 *
 * Hidden spans included: they are hidden from assistive technology, not absent
 * from the row, and a test comparing a row against what the CLI writes has to
 * see the same characters the CLI wrote.
 */
export const text = (line: Line): string => {
  if (line.kind === 'blank') return ''
  if (line.kind === 'art') return line.text
  return line.spans.map((span) => span.text).join('')
}
