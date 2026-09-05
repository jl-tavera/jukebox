import { describe, expect, it } from 'bun:test'
import { fitted } from '../src/fitting'

/**
 * Seam 4: the width planner, called directly.
 *
 * The second discretionary seam in this suite, and it earns its place on
 * `folders.test.ts`'s own grounds. The cases are combinatorial -- a width, five
 * columns and an ordered list of what each one gives up -- and the failure would
 * otherwise be reported several layers from its cause, as a `show` whose table
 * looked slightly wrong on one terminal and right on another.
 *
 * What is asserted here is the decision as well as the code. `show.ts` used to
 * refuse a width outright, on the grounds that a title cut off is a title a
 * reader cannot search for. That reasoning is kept and narrowed rather than
 * discarded: the title is the *last* thing cut, and two whole columns are given
 * up before a single character of it is.
 */

/** A row is `#`, title, artists, album, duration -- `show`'s own five. */
const ROWS = [
  ['1', 'Long Way Down', 'Aria Fenn', 'Ninety Miles', '4:02'],
  ['2', 'Sun Dogs', 'Aria Fenn', 'Ninety Miles', '2:58'],
]

describe('a table that already fits', () => {
  it('is laid out exactly as it would be with no width at all', () => {
    // Two spaces of indent, three between columns, the last cell unpadded: the
    // layout `columns` has always produced. A width nothing overflows must not
    // be a second way of arriving at a different table.
    expect(fitted(ROWS, 80, [])).toEqual([
      '  1   Long Way Down   Aria Fenn   Ninety Miles   4:02',
      '  2   Sun Dogs        Aria Fenn   Ninety Miles   2:58',
    ])
  })
})

describe('a table too wide for its terminal', () => {
  it('gives up a whole column rather than shrinking it to a stub', () => {
    // The album goes entirely. A column cut to `Ninet…` costs almost the same
    // width and tells a reader nothing they could act on, so what it buys is a
    // narrower table that is still unreadable.
    expect(fitted(ROWS, 40, [{ drop: 3 }])).toEqual([
      '  1   Long Way Down   Aria Fenn   4:02',
      '  2   Sun Dogs        Aria Fenn   2:58',
    ])
  })
})

describe('a column that shrinks rather than going', () => {
  it('cuts to the width it has to and marks where it cut', () => {
    // Fifty-three wide naturally, and five too many for this terminal. The
    // title column gives up exactly those five and no more: a table that cut
    // further than it needed would be spending a reader's titles on nothing.
    //
    // `Sun Dogs` is untouched at eight characters. Only the cells that overrun
    // the new width are cut, never the whole column down to its shortest cell.
    expect(fitted(ROWS, 48, [{ trim: 1, least: 8 }])).toEqual([
      '  1   Long Wa…   Aria Fenn   Ninety Miles   4:02',
      '  2   Sun Dogs   Aria Fenn   Ninety Miles   2:58',
    ])
  })
})

/** `show`'s own list: the date goes, then the album, then artists and title. */
const SHOW = [{ drop: 5 }, { drop: 3 }, { trim: 2, least: 8 }, { trim: 1, least: 12 }]

/** A present Track and a Removed one, which is the only row carrying a date. */
const WIDE = [
  ['1', 'Long Way Down', 'Aria Fenn, Kit Marlow', 'Ninety Miles', '4:02', ''],
  ['-', 'Blue Dot', 'Aria Fenn', 'Ninety Miles', '3:34', 'left 2026-08-31 21:29'],
]

describe('the order columns give way in', () => {
  it('spends the date and the album before touching a title or an artist', () => {
    const laid = fitted(WIDE, 60, SHOW)

    for (const line of laid) expect(line.length).toBeLessThanOrEqual(60)

    // Both of the columns a reader is least likely to be scanning for are gone,
    // and both of the ones they came for survived whole.
    expect(laid.join('\n')).not.toContain('Ninety Miles')
    expect(laid.join('\n')).not.toContain('left 2026-08-31')
    expect(laid.join('\n')).toContain('Long Way Down')
    expect(laid.join('\n')).toContain('Aria Fenn, Kit Marlow')
  })

  it('cuts the title only once there is nothing else left to give', () => {
    const laid = fitted(WIDE, 30, SHOW)

    // Two columns gone and the artists cut were still not enough, so the title
    // finally yields -- last, which is the whole of what the order is for.
    expect(laid.join('\n')).toContain('…')
    expect(laid.join('\n')).not.toContain('Long Way Down')
  })

  it('never cuts a column past the floor its author set', () => {
    // Narrower than the moves can achieve. The table overruns rather than
    // shrinking the title to a character and a mark: a width it cannot reach
    // honestly is a width it does not reach.
    const laid = fitted(WIDE, 12, SHOW)

    for (const line of laid) expect(line.length).toBeGreaterThan(12)
  })
})
