import { describe, expect, it } from 'bun:test'
import { DONATIONS_ARE_EXAMPLES, donations } from '../lib/content'
import { EXAMPLES, giving, UNCONFIGURED } from '../lib/session/donate'
import { COMMENT, COPY, spoken, text, type Line, type Span } from '../lib/session/lines'

/**
 * The donation rows, and the one rule about them that is not about a row.
 *
 * Seam one. `SITE.md` 06 asks three things of these values and ADR-0010 says
 * why all three survived the modal being deleted: they were never about the
 * container. Two of them are properties of what `donate` prints and live with
 * the rest of that output; this file opens with the third, which is a property
 * of the values themselves.
 */

/**
 * What each chain's encoding forbids, and what each example is required to
 * break while it is an example.
 *
 * `SITE.md` 06: *a warning banner is not sufficient on its own; the value
 * itself has to be unsendable*. A crypto address sent to the wrong place is
 * gone permanently, so the safeguard is the string rather than a notice
 * somebody can read past -- a wallet has to refuse these before a send can
 * happen.
 *
 * The rules are written out per chain rather than derived from the addresses.
 * A criterion computed from the value it is checking would only assert that
 * the value is the value.
 */
const unsendable: Readonly<Record<string, (address: string) => boolean>> = {
  // bech32 is lower case throughout and a mixed-case string is invalid by
  // spec, so one capital anywhere is enough to fail decoding.
  btc: (address) => /[A-Z]/.test(address),

  // Forty hexadecimal characters after `0x`, and these are not all hexadecimal.
  eth: (address) => /[^0-9a-fA-F]/.test(address.slice(2)),

  // base58 leaves out the four characters that can be mistaken for each other.
  sol: (address) => /[0OIl]/.test(address),
  xmr: (address) => /[0OIl]/.test(address),
}

describe('the addresses, while they are examples', () => {
  it('says so, which is what everything below is conditional on', () => {
    expect(DONATIONS_ARE_EXAMPLES).toBe(true)
  })

  it('breaks its own chain rather than trusting a warning', () => {
    for (const donation of donations) {
      expect(
        unsendable[donation.chain]?.(donation.address),
        `${donation.chain} would be accepted by a wallet`,
      ).toBe(true)
    }
  })

  it('has a rule for every row, so a fifth chain cannot arrive unchecked', () => {
    expect([...donations].map((donation) => donation.chain).sort()).toEqual(
      Object.keys(unsendable).sort(),
    )
  })
})

const rows = (lines: readonly Line[]): string[] => lines.map(text)

const spans = (line: Line): readonly Span[] => (line.kind === 'text' ? line.spans : [])

const control = (line: Line): Span | undefined =>
  spans(line).find((span) => span.copies !== undefined)

describe('the block donate prints', () => {
  it('opens with the warning, behind the sigil a human writes with', () => {
    // `#` is the page's vernacular for *a human wrote this*, and it is
    // decoration -- the terminal draws it and a screen reader is handed the
    // sentence without it.
    const first = giving()[0]!

    expect(text(first)).toBe(`${COMMENT} ${EXAMPLES}`)
    expect(spoken(first)).toBe(EXAMPLES)
  })

  /**
   * The four rows as `SITE.md` 02 drew them, before the modal around them was
   * deleted.
   *
   * Pinned rather than run back through `truncateAddress`. An expectation
   * computed the way the code computes it agrees with the code whatever the
   * code says; these came off the document that specified the layout, which is
   * a source that can disagree.
   */
  const SHOWN: Readonly<Record<string, string>> = {
    btc: 'bc1qEXAMPL…D0q4k9',
    eth: '0xEXAMPLEo…funds0',
    sol: 'EXAMPLEonl…send0l',
    xmr: '4EXAMPLEon…000000',
  }

  it('gives a row its chain, the address shortened, and a control', () => {
    const btc = donations[0]!

    expect(rows(giving([btc], false))).toEqual([`  ${btc.chain}   ${SHOWN.btc}   ${COPY}`])
  })

  it('puts the whole address on the clipboard and only part of it on the row', () => {
    // The rule `SITE.md` 06 asks to be checked by capturing the argument
    // rather than by eye. Here the argument has not been performed yet: it is
    // a declared intent, and reading one is how a module with no clipboard in
    // the room satisfies that.
    const btc = donations[0]!
    const copies = control(giving([btc], false)[0]!)?.copies

    expect(copies?.value).toBe(btc.address)
    expect(copies?.value).not.toBe(SHOWN.btc)
    expect(btc.address.length).toBeGreaterThan(SHOWN.btc!.length)
  })

  it('names the chain the way it is read out rather than the way it is keyed', () => {
    // Four rows carrying the word `copy` are four identical controls to
    // somebody who cannot see which one the cursor is on.
    expect(control(giving([donations[0]!], false)[0]!)?.copies?.what).toBe('the Bitcoin address')
    expect(control(giving([donations[3]!], false)[0]!)?.copies?.what).toBe('the Monero address')
  })

  it('draws no control at all on a row that is not configured', () => {
    // Not a disabled one. A wrong address loses money permanently, so the
    // absence is structural: no span carries `copies`, so the renderer has no
    // button to build and the reducer has no intent to hand over.
    const waiting = { chain: 'btc', label: 'Bitcoin', address: '<btc address>' }
    const [line] = giving([waiting], false)

    expect(rows([line!])).toEqual([`  btc   ${UNCONFIGURED}`])
    expect(control(line!)).toBeUndefined()
  })

  it('continues a note under the address it belongs to', () => {
    const eth = donations[1]!

    expect(rows(giving([eth], false))).toEqual([
      `  eth   ${SHOWN.eth}   ${COPY}`,
      `        ${eth.note}`,
    ])
  })

  it('prints all four, warned, with a row of air under the warning', () => {
    expect(rows(giving())).toEqual([
      `${COMMENT} ${EXAMPLES}`,
      '',
      `  btc   ${SHOWN.btc}   ${COPY}`,
      `  eth   ${SHOWN.eth}   ${COPY}`,
      `        ${donations[1]!.note}`,
      `  sol   ${SHOWN.sol}   ${COPY}`,
      `        ${donations[2]!.note}`,
      `  xmr   ${SHOWN.xmr}   ${COPY}`,
    ])
  })
})
