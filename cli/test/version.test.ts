import { describe, expect, it } from 'bun:test'
import { olderThan, VERSION } from '../src/version'

/**
 * A pure seam, called directly, the way `paths.test.ts` and `mode.test.ts` are.
 *
 * The version gate is the one piece of #33 whose failure is silent. A gate that
 * refuses when it should not is noticed by whoever it refused; a gate that
 * waves through a binary it should have stopped is noticed by nobody, until an
 * old client meets a contract it does not understand and fails in whatever way
 * it happens to fail. So the cases are enumerated here rather than sampled
 * through the boot, where each one would cost a server and a run.
 */

describe('whether this binary predates the oldest one the API will serve', () => {
  it('lets a binary at exactly the minimum through', () => {
    // The published document names `0.1.0` and the first release is `0.1.0`.
    // If this were exclusive, the gate would refuse the very release it was
    // shipped alongside.
    expect(olderThan('0.1.0', '0.1.0')).toBe(false)
  })

  it('refuses a binary below the minimum on any field', () => {
    expect(olderThan('0.1.0', '1.0.0')).toBe(true)
    expect(olderThan('1.0.0', '1.1.0')).toBe(true)
    expect(olderThan('1.1.0', '1.1.1')).toBe(true)
  })

  it('lets a binary above the minimum through on any field', () => {
    expect(olderThan('1.0.0', '0.1.0')).toBe(false)
    expect(olderThan('1.1.0', '1.0.0')).toBe(false)
    expect(olderThan('1.1.1', '1.1.0')).toBe(false)
  })

  it('weighs major before minor before patch', () => {
    // A larger patch does not rescue a smaller major, which comparing the
    // fields in the wrong order or summing them would get wrong.
    expect(olderThan('1.99.99', '2.0.0')).toBe(true)
    expect(olderThan('2.0.0', '1.99.99')).toBe(false)
  })

  it('compares numbers rather than text', () => {
    // The whole reason this function exists. As strings `"0.10.0" < "0.9.0"`,
    // so a text comparison refuses every installed binary on the day the minor
    // version reaches ten -- and does it to everyone at once.
    expect(olderThan('0.10.0', '0.9.0')).toBe(false)
    expect(olderThan('0.9.0', '0.10.0')).toBe(true)
    expect(olderThan('1.0.0', '0.100.0')).toBe(false)
  })

  it('does not gate on a minimum it cannot read', () => {
    // Fail-open, and only here. A `min_version` of `latest` or `0.1` is a typo
    // in a hand-edited file, and a client that bricked itself over one is the
    // exact failure DESIGN.md 07's breaking-change procedure exists to prevent
    // -- with no channel left to reach the people running it. The publish-time
    // check is what catches the typo, and it runs before anyone reads the file.
    for (const minimum of ['', 'latest', '0.1', 'v1.2.3', '1.2.3-rc.1', '1.2.3.4', 'x.y.z']) {
      expect(olderThan('0.1.0', minimum)).toBe(false)
    }
  })

  it('does not gate on a version of its own it cannot read', () => {
    for (const version of ['', 'dev', '0.1', 'v0.1.0']) {
      expect(olderThan(version, '99.0.0')).toBe(false)
    }
  })

  it('does not read a number where the shape forbids one', () => {
    // Spaces and a signed field all parse with `Number` and none of them is a
    // release. Reading the fields with a pattern rather than with `Number`
    // keeps the grammar the schema publishes under and this one the same
    // grammar.
    for (const minimum of [' 1.0.0', '1.0.0 ', '+1.0.0', '1.-0.0']) {
      expect(olderThan('0.1.0', minimum)).toBe(false)
    }
  })
})

describe('the version this binary reports', () => {
  it('is a release the gate can read', () => {
    // The one thing that would switch the gate off without anybody noticing: a
    // version this comparator cannot parse makes `olderThan` fail open for
    // every document, forever. So the day a tag like `0.2.0-rc.1` lands is the
    // day CI says so, rather than the day the API moves.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
