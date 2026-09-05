import {
  DONATIONS_ARE_EXAMPLES,
  donations,
  isConfigured,
  truncateAddress,
  type Donation,
} from '../content'
import {
  blank,
  COMMENT,
  copy,
  decoration,
  dim,
  GUTTER,
  INDENT,
  ink,
  prose,
  row,
  type Intent,
  type Line,
  type Span,
} from './lines'

/**
 * The donation ask, as rows in a scrollback.
 *
 * `SITE.md` 02 gave this a native `<dialog>` and gave the reason: focus
 * trapping, Escape, returning focus to the trigger and making the rest of the
 * page inert all arrive free from the platform, *"and those are precisely the
 * parts of a modal most often got wrong by hand"*. ADR-0010 deleted the dialog
 * because its focus trap solved an overlay problem a terminal does not have,
 * and turned the one part worth keeping into a requirement instead: the copy
 * controls now live in the scrollback and have to stay reachable by keyboard
 * with a visible focus state.
 *
 * **One cost, recorded rather than glossed.** `terminal.ts` announces what a
 * command printed, so a screen reader meets this block as every row run
 * together -- including seventeen characters of an address nobody can use,
 * because the row shows a truncation and the gutters around it are `dim`
 * rather than `decoration` on purpose. The useful string is the control's own
 * accessible name, which names the chain in full. Marking the address hidden
 * would tidy the announcement and would also take the value away from a reader
 * walking the scrollback, which is the page deciding what somebody may read.
 * So it stands as a cost.
 *
 * **Three rules came through that unchanged, because none of them was ever
 * about the container.** They are about the values, and they are why
 * `lib/content.ts` kept these rows through the ticket that deleted their only
 * consumer: an example address breaks its own chain's encoding so a wallet
 * refuses it, a row that is not configured renders `not configured` and draws
 * no copy control at all, and what reaches the clipboard is the whole address
 * however little of it the row shows.
 */

/** The page's own verb for all of this. `commands.ts` registers it under this name. */
export const DONATE = 'donate'

/**
 * Said above the rows while the addresses are examples.
 *
 * Two sentences and no hedging. `SITE.md` 06 is explicit that this notice is
 * not the safeguard -- the values are -- so it is here to stop somebody wasting
 * a transfer rather than to stop one succeeding.
 */
export const EXAMPLES = 'These are example addresses. Every wallet will reject them.'

/** What an address still waiting to be set renders instead of a value. */
export const UNCONFIGURED = 'not configured'

/**
 * What reaches the clipboard, and what a screen reader is told reached it.
 *
 * **The whole address, never the truncation the row shows.** `SITE.md` 06
 * states it as a rule and says how to check it -- *verify by capturing the
 * argument to `clipboard.writeText`, not by eye* -- because funds sent to a
 * shortened string are gone. The row is what fits on a phone; this is what a
 * wallet is given.
 *
 * `what` is the human name rather than the chain key, because it is read out
 * rather than looked at: the control is named `copy the Bitcoin address` and
 * `terminal.ts` announces `Copied the Bitcoin address.` after it is used.
 * `btc` would be four rows of the same three letters to somebody who cannot
 * see which one the cursor is on.
 */
export const copying = (donation: Donation): Intent => ({
  kind: 'copy',
  value: donation.address,
  what: `the ${donation.label} address`,
})

/**
 * What is drawn where the address goes.
 *
 * The one place the `not configured` decision is taken, so the column it is
 * measured into and the span it is drawn as cannot disagree about which rows
 * are configured.
 */
const shown = (donation: Donation): string =>
  isConfigured(donation.address) ? truncateAddress(donation.address) : UNCONFIGURED

/**
 * The value, and the control beside it when there is one to draw.
 *
 * **An unconfigured row ends here.** `SITE.md` 06: *a wrong crypto address
 * loses money permanently, so a donor must not be able to put one on their
 * clipboard* -- so the absence is structural rather than a disabled control. A
 * row with no `copies` span is a row the renderer has no button to build, and
 * `terminal.ts` has no intent to hand over.
 *
 * The gutter is `dim` rather than `decoration`, for the reason `install.ts`
 * gives about its own: decoration is hidden from assistive technology, and a
 * hidden run of spaces would hand a screen reader `bc1qEXAMPL…D0q4k9copy`.
 */
const offered = (donation: Donation, width: number): Span[] =>
  isConfigured(donation.address)
    ? [
        ink(shown(donation)),
        dim(' '.repeat(width - shown(donation).length) + GUTTER),
        copy(copying(donation)),
      ]
    : [dim(UNCONFIGURED)]

/**
 * Every row, and the warning above them when there is one to give.
 *
 * **Both the rows and the flag arrive as defaulted arguments, and the
 * defaults are the real page.** Every address in `donations` is configured
 * today and the flag is `true`, so the two branches this file exists to get
 * right would otherwise be unreachable -- and an unreachable branch is one
 * nobody has checked. `finished(version, system = SERVED)` is the precedent
 * and the shape is its: the default is what the page actually does, and the
 * parameter is there so a caller can ask what it would do otherwise.
 *
 * Both columns are measured rather than chosen, so the controls line up
 * whatever is in the rows and a fifth chain with a longer key cannot push one
 * out of the table. A note continues under its own address at the column the
 * address starts in, which is what a wrapped second line of a table is.
 */
export const giving = (
  rows: readonly Donation[] = donations,
  examples: boolean = DONATIONS_ARE_EXAMPLES,
): Line[] => {
  const key = Math.max(...rows.map((donation) => donation.chain.length))
  const width = Math.max(...rows.map((donation) => shown(donation).length))
  const under = ' '.repeat(INDENT.length + key + GUTTER.length)

  return [
    ...(examples ? [row(decoration(`${COMMENT} `), prose(EXAMPLES)), blank()] : []),
    ...rows.flatMap((donation) => [
      row(
        dim(`${INDENT}${donation.chain}${' '.repeat(key - donation.chain.length)}${GUTTER}`),
        ...offered(donation, width),
      ),
      ...(donation.note === undefined ? [] : [row(dim(`${under}${donation.note}`))]),
    ]),
  ]
}
