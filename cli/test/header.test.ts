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

/**
 * The first row of the art: present when the wordmark was drawn, absent when
 * the word was.
 *
 * The first **non-empty** row, since #68 gave the mark a blank one to open
 * with. Taking row zero would hand back `''`, which makes every `toContain`
 * below assert nothing and makes the one `not.toContain` fail outright --
 * every string contains the empty string.
 */
const ART = WORDMARK.split('\n').find((row) => row !== '')!

/** How many rows of art there are, counted off the art rather than written down. */
const ART_ROWS = WORDMARK.split('\n').filter((row) => row !== '').length

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

  it('opens with a blank row at either width', () => {
    // #68, and #66 is why it is wanted: the header is pinned to the top of the
    // screen now, so without this the mark sits hard against the edge. Asserted
    // at both widths because the art carries its own blank row out of the
    // banner and the word is given one here -- two mechanisms, one result, and
    // a narrow terminal that looked different from a wide one would be the bug.
    for (const columns of [NATURAL, NATURAL - 1]) {
      expect(header(columns, '0.1.0', false).split('\n')[0]).toBe('')
    }
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
    const drawn = header(NATURAL, '0.1.0', true).split('\n')
    const bare = (row: string): number => [...row.replaceAll(/\x1b\[[\d;]*m/g, '')].length

    // The blank row first, then the art. Counted off `WORDMARK` rather than
    // written out, so a sixth row of art would be measured rather than skipped.
    expect(bare(drawn[0]!)).toBe(0)
    expect(drawn.slice(1, 1 + ART_ROWS).map(bare)).toEqual(new Array(ART_ROWS).fill(NATURAL))
  })

  it('leaves the blank row genuinely empty', () => {
    // Bracketing nothing in a colour and a reset is two escapes that change
    // nothing on a row nobody is meant to see -- and it would stop the row
    // being `''` for anything that measures it, this file included.
    expect(header(NATURAL, '0.1.0', true).split('\n')[0]).toBe('')
  })
})
