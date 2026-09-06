import { describe, expect, it } from 'bun:test'
import { header } from '../lib/session/header'
import {
  blank,
  chip,
  copy,
  CRLF,
  decoration,
  dim,
  ink,
  inverted,
  prose,
  row,
  spoken,
  text,
  word,
  written,
  type Intent,
  type Line,
  type Span,
  type Tone,
} from '../lib/session/lines'

/**
 * The vocabulary itself, which #85 is the first ticket to widen and #111 the
 * second.
 *
 * `text` is what the terminal printed, `spoken` is what a screen reader is
 * given, and `written` is what a terminal emulator is handed. They differ by
 * exactly the decoration and exactly the attributes -- so they are tested
 * against each other rather than each against a literal, which is the only way
 * the difference is the thing being asserted.
 *
 * The codes are the one exception and are transcribed from #111's own table,
 * because an escape asserted against the constant that produced it would agree
 * with whatever that constant happened to say.
 */

describe('word', () => {
  it('runs what it says, and takes no second opinion about it', () => {
    // It carried an argument for a word reading one thing and running another,
    // reserved first for #91's picker -- which since #86 has rows rather than
    // words -- and then for #91's copy control, which turned out not to run
    // anything at all. Both consumers came and neither used it, so it is gone,
    // and this is what says so.
    expect(word('help')).toEqual({ text: 'help', tone: 'ink', runs: 'help' })
  })

  it('is ink, because the hover wash is mixed for ink and nothing else', () => {
    // ADR-0010's floor asks `--dim` to clear 4.5:1 over the wash, and in the
    // light theme it has no headroom to do it with. #85 stays clear of that by
    // construction rather than by measurement: the only thing the wash ever
    // paints is a word, and a word is always the page's own colour.
    expect(word('help').tone).toBe('ink')
  })
})

describe('chip', () => {
  it('is a landable word like any other', () => {
    // #89's status line is not a new control. It is the one the page already
    // has -- the same class, the same invisible tap target, the same inversion
    // under focus -- so a chip runs what it reads, exactly as `word` does.
    expect(chip('help').runs).toBe('help')
  })

  it('is prose, because the status line is the page talking and not the binary', () => {
    // ADR-0010 gives Argon to the lede, the hints and the site's own verbs, and
    // names the chips among them. Neon is what the binary printed; the status
    // line is not.
    expect(chip('help').tone).toBe('prose')
  })

  it('is not dim, so the wash is still only ever laid under ink', () => {
    // The constraint `word` states one screen up, restated here because this is
    // the ticket its own note predicted would break it. ADR-0010 asks `--dim`
    // to clear 4.5:1 over the hover wash and the light theme has no headroom
    // for it -- but `prose` changes the typeface and not the colour, so the
    // day a landable word is dim is still ahead rather than here.
    expect(chip('help').tone).not.toBe('dim')
  })
})

describe('copy', () => {
  const intent: Intent = { kind: 'copy', value: 'the whole thing', what: 'a value' }

  it('carries the value rather than running anything', () => {
    // The distinction the two fields exist for. A control that ran a command
    // would reprint whatever printed it, and #91 asks a scrollback row to be
    // copyable again *without re-running anything*.
    const control = copy(intent)

    expect(control.copies).toBe(intent)
    expect(control.runs).toBeUndefined()
  })

  it('reads as one word, whatever it is copying', () => {
    // `copy` on one row and `copy address` on another would be two
    // vocabularies for one gesture.
    expect(copy(intent).text).toBe('copy')
    expect(copy({ kind: 'copy', value: 'x', what: 'something else' }).text).toBe('copy')
  })

  it('is said out loud, because it is a control rather than a rail glyph', () => {
    expect(spoken(row(copy(intent)))).toBe('copy')
  })
})

describe('spoken', () => {
  it('leaves out the frame and keeps the picture', () => {
    // The rail, the sigils and the backticks are drawn rather than said. A
    // screen reader hearing "backtick help backtick" is hearing punctuation the
    // page put there for a sighted reader.
    const line = row(prose('Try '), decoration('`'), word('help'), decoration('`'), prose('.'))

    expect(text(line)).toBe('Try `help`.')
    expect(spoken(line)).toBe('Try help.')
  })

  it('says nothing for a blank row', () => {
    expect(spoken(blank())).toBe('')
  })

  it('says the label of the wordmark rather than its glyphs', () => {
    // `screen.tsx` already renders the art as `role="img"` with this label, so
    // reading the Block Elements out would be reading the picture twice, badly.
    const art: Line = { kind: 'art', text: '███', label: 'Jukebox' }

    expect(spoken(art)).toBe('Jukebox')
  })

  it('is the whole row when nothing on it is decoration', () => {
    const line = row(ink('add'), dim('  Track a playlist.'))

    expect(spoken(line)).toBe(text(line))
  })
})

describe('written', () => {
  /**
   * The mark as `header.ts` actually builds it: several rows of Block Elements
   * inside one `art` line.
   *
   * Taken from the header rather than re-split from `WORDMARK` here, because a
   * fixture that re-implements that split can agree with itself while
   * disagreeing with the page. `header.test.ts` owns the split and argues for
   * it; this file only needs a line that really does have rows inside it.
   */
  const MARK = header('1.2.3').find((line) => line.kind === 'art')!

  /** Every attribute this serialiser writes, so a test can take them all off. */
  const SGR = /\x1b\[[0-9;]*m/g

  it('gives each rung of the ladder the code #111 assigns it', () => {
    // Transcribed from the ticket's table rather than read back off `OPEN`,
    // which is the only way this assertion can ever disagree with the code.
    //
    // `dim` is bright black rather than faint deliberately. Faint is
    // implementation-defined across emulators; 90 resolves to a palette slot
    // the site fills and whose contrast it has already measured in both themes.
    expect(written([row(ink('x'))])).toBe('\x1b[0mx\x1b[0m')
    expect(written([row(inverted('x'))])).toBe('\x1b[7mx\x1b[0m')
    expect(written([row(dim('x'))])).toBe('\x1b[90mx\x1b[0m')
    expect(written([row(prose('x'))])).toBe('x\x1b[0m')
  })

  it('closes even the tones that opened nothing, so the rule stays one line', () => {
    // `ink` is SGR 0, so it opens and closes with the same byte, and `prose`
    // opens with none at all. Both look redundant and both are kept: the
    // moment closing becomes conditional, a span's bytes start depending on
    // the span in front of it, which is the property the test below denies.
    expect(written([row(ink('x'))]).endsWith('\x1b[0m')).toBe(true)
    expect(written([row(prose('x'))]).endsWith('\x1b[0m')).toBe(true)
  })

  it('writes the wordmark as its glyphs, wearing no attribute of its own', () => {
    // The `Line` type gives art no tone, so an attribute here would be
    // inventing vocabulary this ticket is not allowed to invent. The mark's
    // colour is settled twice already and differently -- `cli/src/header.ts`
    // writes truecolor yellow, `session/header.ts` says "No colour, so no
    // escapes" -- and #112 bridges it through palette slots. A third opinion
    // in a third file is what those docblocks exist to prevent.
    expect(written([MARK])).not.toContain('\x1b')
  })

  it('leaves the wordmark no newline a cursor would not return from', () => {
    // `header.ts` builds the mark as several rows inside ONE line, joined with
    // `\n`. Joining lines with CRLF never reaches inside one, so every row but
    // the first would begin where the last ended and the mark would stair-step
    // down and to the right. That is the exact failure CRLF is here to prevent,
    // and it is invisible until #112 renders.
    expect(written([MARK]).split(CRLF).join('')).not.toContain('\n')

    // And the rows are the ones the terminal would have printed, checked
    // against `text` the way this file checks everything else: the separator
    // swapped, and not one glyph of the art touched on the way past.
    expect(written([MARK]).split(CRLF)).toEqual(text(MARK).split('\n'))
  })

  it('joins rows with CRLF, because a bare newline leaves the cursor where it was', () => {
    // A terminal drops a line on LF and does not return to column zero, so a
    // separator that is not CRLF stair-steps every row after the first.
    //
    // Both bytes are written out by hand here, and this is the only place they
    // are. Every other assertion in this block reaches the separator through
    // the imported constant, which would agree with `\n` just as readily -- and
    // the separator is the one byte-level claim #112 is built on, so it is
    // pinned to the ticket's table the way the four codes above are.
    expect(CRLF).toBe('\r\n')
    expect(written([row(ink('a')), row(ink('b'))])).toBe('\x1b[0ma\x1b[0m\r\n\x1b[0mb\x1b[0m')
  })

  it('gives a blank row nothing but its place in the stream', () => {
    // `blank` is the page's only vertical spacing mechanism, so it has to
    // survive as a row rather than vanish: two rows around one blank are three
    // rows on the terminal.
    expect(written([row(ink('a')), blank(), row(ink('b'))]).split(CRLF)).toHaveLength(3)
    expect(written([blank()])).toBe('')
  })

  it('is empty for no lines at all, which is what `clear` answers with', () => {
    // `clear` prints `body: []`. A serialiser that terminated rows rather than
    // joining them would print a blank row for the one command whose whole
    // answer is the screen going blank.
    expect(written([])).toBe('')
  })

  it('composes, so no span can depend on the span in front of it', () => {
    // The bleed rule, asserted as a property rather than as a literal: if any
    // tone ever failed to close, a pair would stop being the two singles
    // concatenated. Driven off the ladder, so a fifth rung joins by being
    // added here rather than by anyone remembering to widen a literal.
    const LADDER: Readonly<Record<Tone, (text: string) => Span>> = { ink, inverted, dim, prose }

    for (const [first, a] of Object.entries(LADDER)) {
      for (const [second, b] of Object.entries(LADDER)) {
        expect(written([row(a('x'), b('y'))]), `${first} then ${second}`).toBe(
          written([row(a('x'))]) + written([row(b('y'))]),
        )
      }
    }
  })

  it('paints an inverted span against the ground and not against its neighbour', () => {
    // What the property above is protecting, written out once because it is
    // what "a tone bleeds" actually looks like. SGR 7 reverses whatever is in
    // force, so a `dim` left open in front of it would paint the row
    // ground-on-bright-black instead of ground-on-ink.
    expect(written([row(dim('  '), inverted('add'))])).toBe('\x1b[90m  \x1b[0m\x1b[7madd\x1b[0m')
  })

  it('is the row the terminal printed, once the attributes are taken back off', () => {
    // The method this file's header states, extended to the third serialiser:
    // asserted against `text` rather than against a literal, so what is pinned
    // is the difference between them rather than a transcription of either.
    // Decoration is written, as `text` writes it -- the terminal draws the
    // backticks even though a screen reader is spared them.
    const session = [
      row(ink('add'), dim('  Track a playlist.')),
      blank(),
      row(prose('Try '), decoration('`'), word('help'), decoration('`'), prose('.')),
    ]

    expect(written(session).replace(SGR, '').split(CRLF)).toEqual(session.map(text))
  })
})
