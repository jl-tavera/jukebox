import { describe, expect, it } from 'bun:test'
import {
  blank,
  decoration,
  dim,
  ink,
  prose,
  row,
  spoken,
  text,
  word,
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
  it('runs what it says, unless told otherwise', () => {
    // The common case is a command name that both reads and runs as itself, so
    // saying it twice is what the default is for. #91's picker is the case that
    // needs the second argument: a row reading `macos` runs something longer.
    expect(word('help')).toEqual({ text: 'help', tone: 'ink', runs: 'help' })
    expect(word('macos', 'install macos')).toEqual({
      text: 'macos',
      tone: 'ink',
      runs: 'install macos',
    })
  })

  it('is ink, because the hover wash is mixed for ink and nothing else', () => {
    // ADR-0010's floor asks `--dim` to clear 4.5:1 over the wash, and in the
    // light theme it has no headroom to do it with. #85 stays clear of that by
    // construction rather than by measurement: the only thing the wash ever
    // paints is a word, and a word is always the page's own colour.
    expect(word('help').tone).toBe('ink')
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
