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
 * The sigils, which are vocabulary rather than composition.
 *
 * They live here, at the leaf, because two modules need them and neither should
 * have to reach through the other to get them: `index.ts` writes the line the
 * page shows being typed, and `commands.ts` builds the binary's prompt out of
 * the same two pieces. Kept in `index.ts` -- where #82 first wrote them -- they
 * would have made the command registry import the module that composes the
 * finished session, which is the dependency pointing the wrong way.
 *
 * `index.ts` re-exports all three, so nothing that already imported them from
 * there had to change.
 */

/** The sigil that says a human wrote this. */
export const COMMENT = '#'

/** The shell's own, on the line the visitor is shown being typed. */
export const PROMPT = '$'

/** What is typed at it. A bare invocation, which is what opens the menu. */
export const TYPED = 'jukebox'

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
 * lede, which a person wrote. It resolves to Monaspace Argon and every other
 * tone to Monaspace Neon, both vendored and subset. The two are built at
 * identical metrics, so the voice changes without the character grid moving a
 * column -- which is why this can be a tone at all rather than a layout
 * decision, and why this stays the only place that has to know.
 */
export type Tone = 'inverted' | 'ink' | 'prose' | 'dim'

/**
 * A run of text in one tone.
 *
 * `hidden` marks decoration -- a rail glyph, the `#` on a comment, the `$` on a
 * prompt. It is what a terminal draws and not what it says, so a screen reader
 * is better off without it. It is a rendering hint and nothing more: `text`
 * below joins hidden spans with the rest, because the terminal prints them.
 *
 * `runs` is the odd one out and is worth admitting rather than glossing: every
 * other field here describes drawing, and this one describes what happens when
 * a person lands on the word and presses Enter. #85 added it, and the
 * alternative it was chosen over is why it earns the exception -- the component
 * could have matched a span's text against the command registry instead, which
 * needs no new field and is worse, because it would make `add` a control
 * everywhere those three letters appear, including inside a sentence about it.
 * Saying which spans are landable is a decision, and decisions belong to the
 * module rather than to a `String.prototype.includes` in the renderer.
 */
export type Span = { text: string; tone: Tone; hidden?: true; runs?: string }

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
 * Writing to a clipboard and moving focus are not expressible as a pure
 * function of state, so they leave here as a declaration and the component
 * performs them. ADR-0010 asks for this in order to make `SITE.md` 06's
 * existing rule satisfiable without a browser -- *verify by capturing the
 * argument to `clipboard.writeText`, not by eye* -- and capturing an intent is
 * how a test does that with no clipboard in the room.
 *
 * **Scheduling a timer was named here too, and #84 -- the first ticket to
 * schedule one -- did not use this mechanism.** The sentence is corrected
 * rather than left standing, because a rule whose own first consumer went
 * around it is worse than no rule. A timer is the one such effect that has to
 * be *cancelled*, on a skip and on an unmount, and an intent carries no handle
 * to cancel by -- so the state a component needs in order to do the cancelling
 * has to exist either way, and an intent would be ceremony on top of it.
 * `boot.ts` puts the duration in the frame instead, and this type stays what it
 * is: effects that are fired and forgotten.
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
 * A word the cursor can land on, and what it runs when it does.
 *
 * The page has no buttons, so this is what a control looks like here: a bare
 * word that inverts under focus and washes under hover, with a tap target
 * around it that nobody can see. #85 draws the first ones -- the command names
 * in `help` -- and #86's menu rows, #88's copy controls and #89's chips are all
 * the same word wearing the same class.
 *
 * `runs` defaults to the text because the common case is a command name that
 * reads and runs as itself. #91's picker is the case the second argument
 * exists for: a row reading `macos` runs something longer than that.
 *
 * Always `ink`, and not by accident. ADR-0010's floor asks `--dim` to clear
 * 4.5:1 over the hover wash, and in the light theme `--dim` has no headroom to
 * do it with -- so the wash is only ever laid under a word, and a word is only
 * ever the page's own colour. A dim landable word is the day that row of the
 * floor becomes a real constraint rather than a satisfied one.
 */
export const word = (text: string, runs: string = text): Span => ({ text, tone: 'ink', runs })

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

/**
 * One line as a screen reader is given it.
 *
 * The counterpart to `text` above, and the pair is the whole of the difference
 * `hidden` makes: the terminal prints the rail, the sigils and the backticks
 * around a command, and none of it is content. A reader hearing "backtick help
 * backtick" is hearing punctuation the page put there for somebody else.
 *
 * The wordmark answers with its label rather than its glyphs, which is what
 * `screen.tsx` already renders it as -- `role="img"` with the same string. Read
 * out, the art is several hundred Block Elements.
 *
 * #85 uses this to build what the live region announces. It is not what the
 * scrollback renders: the rows carry their own text and their own `aria-hidden`
 * spans, and this exists so the announcement can be one string.
 */
export const spoken = (line: Line): string => {
  if (line.kind === 'blank') return ''
  if (line.kind === 'art') return line.label
  return line.spans
    .filter((span) => span.hidden !== true)
    .map((span) => span.text)
    .join('')
}
