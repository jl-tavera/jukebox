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

/**
 * The two measurements every table on this page is built out of.
 *
 * `cli/src/phrasing.ts`'s `columns` -- the metrics #79 asks a table here to
 * reuse rather than invent. They sit at the leaf for the reason the sigils
 * below do: several modules draw a table, and none of them should have to
 * reach through another to find out how wide a gutter is. They were two
 * copies, each with its own docblock claiming to quote the same source, and
 * #88's two new tables were about to make it four -- which is four places for
 * one set of metrics to stop agreeing.
 */
export const INDENT = '  '
export const GUTTER = '   '

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
 * `struck` is the second such hint and #86 is what asked for it. The prompt
 * library strikes out the value a select was abandoned on, and a strikethrough
 * is decoration rather than colour -- so it is part of the shape the page has
 * to match, where the library's cyan and green are exactly what it must not
 * copy. One flag rather than a step of the ladder: it is orthogonal to tone,
 * and the struck value is dim underneath it.
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
 *
 * `copies` is the third such field and #91 is what asked for it. It is a
 * control like `runs` and deliberately not the same one: **a copy control must
 * not re-run the command that printed it.** #91's whole point about the row it
 * leaves in the scrollback is that the command can be copied again *without
 * re-running anything*, and `runs` re-enters a line at the prompt by
 * definition -- so a `copy` word carrying `runs` would print the block a second
 * time every time somebody used it. Two fields, because they are two gestures.
 */
export type Span = {
  text: string
  tone: Tone
  hidden?: true
  struck?: true
  runs?: string
  copies?: Copying
}

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
 * The two palettes, and the three answers a visitor can give about them.
 *
 * Here, at the leaf, for the reason `COMMENT` and `Open` are: `Intent` below
 * names a theme, and `theme.ts` and `terminal.ts` both name one -- so a leaf
 * reaching back through the module that composes it would be the dependency
 * pointing the wrong way. This file still imports nothing.
 *
 * **`system` is not a third palette.** It is the absence of a choice, which is
 * why it is a member of `Theme` and not of `Scheme`, and why it has to stay
 * reachable: ADR-0010 asks that one switch does not permanently opt a visitor
 * out of following their operating system, and a type where the three are one
 * flat set is a type that has already forgotten which of them is the default.
 */
export type Scheme = 'light' | 'dark'

export type Theme = Scheme | 'system'

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
 * **Two members, and the second is why the first was written as a union at
 * all.** It said so: one member was what kept the array widenable, because a
 * `readonly never[]` cannot gain one without editing the type every later
 * ticket depends on. #91 emitted the clipboard write, from `install` and from
 * every copy control the page draws; #88 adds the theme, which `next-themes`
 * owns and this module may not touch. The finished session still declares
 * neither -- it hands the visitor a command and changes nothing about their
 * browser to do it.
 *
 * They are named apart as well as discriminated, because only one of them can
 * sit on a row. `Span.copies` is a `Copying`: a word the cursor lands on that
 * meant *switch the page to dark* would not be the control #91 defined, and
 * the type is where that is settled rather than in a renderer's `if`.
 *
 * **Their payloads are named apart too, and that is the load-bearing half.**
 * A `Choosing` carries `theme` where a `Copying` carries `value`, so
 * `intent.value` does not compile until the kind has been asked -- and the one
 * mistake this split exists to prevent, a theme name written to somebody's
 * clipboard, stops being a mistake anybody can make. Two fields called `value`
 * would have type-checked it.
 *
 * `what` is the value named for somebody who cannot see the row it came from:
 * `terminal.ts` announces `Copied ${what}.` when a control is used, so it is a
 * noun phrase rather than a label. A theme carries none, because nothing is
 * left holding one -- the answer to `theme dark` is the page going dark, and
 * the row above it already says so.
 */
export type Copying = { kind: 'copy'; value: string; what: string }

export type Choosing = { kind: 'theme'; theme: Theme }

export type Intent = Copying | Choosing

/**
 * One row of a select, and what choosing it types.
 *
 * `label` is what the widget shows and `hint` is what the active row says about
 * itself. `runs` is what the page enters when the row is chosen, and **absent
 * means the row only closes the select** -- which is the whole of what `quit`
 * is, and what "the way out" means in a menu that launches commands.
 *
 * It is the second argument of `word` one screen down, arriving as a field:
 * #91's picker shows a row reading `macos` and enters something considerably
 * longer than that.
 */
export type Option = { label: string; hint: string; runs?: string }

/**
 * A select still waiting on an answer: what it asks, what it offers, and which
 * row the cursor is standing on.
 *
 * Here rather than in `select.ts`, where the widget is drawn, because `Session`
 * below has to name it and a leaf reaching back through the module that
 * composes it is the dependency pointing the wrong way -- the reason `COMMENT`,
 * `PROMPT` and `TYPED` moved down here in #85. It sits beside `Intent` for the
 * matching reason: both are state the module hands over that is not a row.
 */
export type Open = { message: string; options: readonly Option[]; cursor: number }

/**
 * What the module computes and the renderer is handed. Nothing else crosses.
 *
 * `open` is the one field the renderer ignores, and it is not for the renderer:
 * the rows of the widget are already in `lines`, drawn. It is what says the
 * widget is still *live* -- that arrows move it and Enter answers it -- which
 * is the fact `terminal.ts` needs and cannot recover from the rows. It travels
 * on the session rather than in the reducer's own state so that `finished` can
 * hand a served page a menu that is already open, with one source of truth
 * rather than two that can disagree.
 */
export type Session = { lines: readonly Line[]; intents: readonly Intent[]; open?: Open }

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
 * A value the widget was left on, struck the way the prompt library strikes it.
 *
 * A hint like `decoration` rather than a step of the ladder, and it sits here
 * for that reason: strikethrough is orthogonal to tone, and the value under it
 * is dim either way. Always dim, because a select that was abandoned is the
 * only thing on this page that draws one.
 */
export const struck = (text: string): Span => ({ text, tone: 'dim', struck: true })

/**
 * A word the cursor can land on, and what it runs when it does.
 *
 * The page has no buttons, so this is what a control looks like here: a bare
 * word that inverts under focus and washes under hover, with a tap target
 * around it that nobody can see. #85 draws the first ones -- the command names
 * in `help` -- and #88's copy controls and #89's chips are the same word
 * wearing the same class.
 *
 * **The menu's rows are deliberately not among them, and #86 is where that was
 * decided rather than overlooked.** The tap target is real padding on the row,
 * so a landable label grows its row from one line to 44px; five of those inside
 * a rail put the `│` glyphs thirty pixels apart and the vertical line the
 * widget is identified by comes apart. The rail's shape is the whole of what
 * #86 is protecting, so the select is driven from the prompt instead -- arrows,
 * Enter, or typing an entry's name.
 *
 * **It runs what it reads, and there is no second argument any more.** One was
 * carried here from #85 for a word reading one thing and running another, first
 * against #91's picker -- which since #86 has rows rather than words, and
 * `Option.runs` a screen up -- and then against #91's copy control, on the
 * grounds that a word reading `copy` was exactly its shape. That control landed
 * and did not use it: copying is not running, and `copies` below is its own
 * field for the reason `Span` gives. So it is deleted, which is what its own
 * note asked for.
 *
 * Always `ink`, and not by accident. ADR-0010's floor asks `--dim` to clear
 * 4.5:1 over the hover wash, and in the light theme `--dim` has no headroom to
 * do it with -- so the wash is only ever laid under a word, and a word is only
 * ever the page's own colour. A dim landable word is the day that row of the
 * floor becomes a real constraint rather than a satisfied one.
 */
export const word = (text: string): Span => ({ text, tone: 'ink', runs: text })

/**
 * The one control the page has that is not a command.
 *
 * Drawn as a word, because everything interactive here is: the same class, the
 * same invisible tap target, the same inversion under focus. What it carries is
 * the whole value rather than what the row shows of it -- `SITE.md` 06 requires
 * that of a donation address and #91 requires it of an install command, and in
 * both cases the row on screen has something in front of it a shell would
 * choke on.
 *
 * The text is fixed. A page with `copy` on one row and `copy address` on
 * another would be two vocabularies for one gesture.
 */
export const COPY = 'copy'

export const copy = (intent: Copying): Span => ({ text: COPY, tone: 'ink', copies: intent })

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
