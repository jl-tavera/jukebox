import { describe, expect, it } from 'bun:test'
import { header, NARROW_MARK, NATURAL } from '../src/header'
import { WORDMARK } from '../src/wordmark'

/**
 * The header, asked the two questions a terminal makes it answer.
 *
 * A pure function tested directly, the way `mode.test.ts` tests the other two
 * predicates and for the same reason: width and colour are a small grid of
 * cases, and reaching each of them through a menu would mean scripting a
 * keyboard to assert something no keystroke affects.
 *
 * Colour is a parameter here rather than a question this file asks. The colour
 * library computes its answer once, when it is imported, from the real process
 * -- so a test cannot move it, and a header that read it directly would have
 * exactly one branch reachable from a suite.
 */

/** The first row of the art: present when the wordmark was drawn, absent when the word was. */
const ART = WORDMARK.split('\n')[0]!

/** What a truecolor escape naming the site's `--ink` looks like. */
const YELLOW = '\x1b[38;2;255;212;0m'

describe('the wordmark at a terminal width', () => {
  it('draws the art at its natural width', () => {
    expect(header(NATURAL, '0.1.0', false)).toContain(ART)
  })

  it('draws the art on anything wider', () => {
    expect(header(120, '0.1.0', false)).toContain(ART)
  })

  it('draws the word instead one column below it', () => {
    const drawn = header(NATURAL - 1, '0.1.0', false)

    // The whole point of the fallback: the art wrapped is not a smaller mark,
    // it is five rows of confetti.
    expect(drawn).not.toContain(ART)
    expect(drawn).toContain(NARROW_MARK)
  })

  it('draws the word on a very narrow terminal too', () => {
    expect(header(20, '0.1.0', false)).toContain(NARROW_MARK)
  })
})

describe('the version line', () => {
  it('names the binary and its version, at either width', () => {
    for (const columns of [NATURAL, NATURAL - 1]) {
      expect(header(columns, '1.2.3', false)).toContain('jukebox 1.2.3')
    }
  })
})

describe('colour', () => {
  it('emits the site yellow as a truecolor escape', () => {
    // picocolors carries the basic sixteen and no truecolor, so the brand
    // yellow is not reachable through it and is written out here.
    expect(header(NATURAL, '0.1.0', true)).toContain(YELLOW)
  })

  it('colours the narrow wordmark the same way', () => {
    expect(header(20, '0.1.0', true)).toContain(YELLOW)
  })

  it('writes no escape at all when colour is unsupported', () => {
    // `NO_COLOR`, a dumb terminal, or a pipe. One assertion rather than one per
    // escape: anything that starts an escape sequence fails this.
    for (const columns of [NATURAL, NATURAL - 1]) {
      expect(header(columns, '0.1.0', false)).not.toContain('\x1b')
    }
  })

  it('does not change what the art measures', () => {
    // The reason the escapes bracket each row rather than wrapping the block:
    // a terminal counts columns in printable characters, and art that measured
    // 67 uncoloured and something else coloured would wrap only for the people
    // who have colour.
    const rows = header(NATURAL, '0.1.0', true)
      .split('\n')
      .slice(0, 5)
      .map((row) => [...row.replaceAll(/\x1b\[[\d;]*m/g, '')].length)

    expect(rows).toEqual([NATURAL, NATURAL, NATURAL, NATURAL, NATURAL])
  })
})
