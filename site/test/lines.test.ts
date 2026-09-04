import { describe, expect, it } from 'bun:test'
import {
  blank,
  copy,
  decoration,
  dim,
  ink,
  prose,
  row,
  spoken,
  text,
  word,
  type Intent,
  type Line,
} from '../lib/session/lines'

/**
 * The vocabulary itself, which #85 is the first ticket to widen.
 *
 * `text` is what the terminal printed and `spoken` is what a screen reader is
 * given, and the two differ by exactly the decoration -- so they are tested
 * against each other rather than each against a literal, which is the only way
 * the difference is the thing being asserted.
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
