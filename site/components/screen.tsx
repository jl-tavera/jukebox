import type { Copying, Line, Session, Span, Tone } from '@/lib/session/lines'

/**
 * The one thing that writes.
 *
 * `cli/src/render.ts` says of itself that it is the only place anything is
 * written, and everything upstream of it computes and prints nothing on the
 * way. This is that file for the page: it is handed a session and turns it into
 * markup, and it holds no state, runs no effect and makes no decision the
 * module did not already make.
 *
 * **Every row is in the served HTML, and #85 changed what guarantees that.**
 * Until now this was a server component and the guarantee was structural -- a
 * file with no `"use client"` in it cannot render anywhere but on the build
 * machine. A live prompt needs state, and `clear` has to be able to empty rows
 * that were served, so `components/live.tsx` now owns this and pulls it into
 * the client bundle with it.
 *
 * The guarantee survives, on a different footing: `next.config.ts` sets
 * `output: 'export'`, and a static export prerenders a client component's first
 * render into the HTML it ships. So the page is still whole for a crawler, for
 * a screen reader, for a visitor whose JavaScript failed and for one who has
 * asked for reduced motion, and #84's typing is still an enhancement over that
 * floor rather than the only way to see the page.
 *
 * What was lost is that the old guarantee could not fail quietly and this one
 * can: a hydration-gated render, an effect that clears before it paints, a
 * `dynamic()` import with `ssr: false`, and the floor is gone with nothing in
 * this file looking any different. **`e2e/served.spec.ts` is what replaces it.**
 * It loads the page with JavaScript disabled and asserts the version line, the
 * five menu rows and the corner that closes the rail are all there. Delete that
 * spec and this paragraph is a wish.
 */

/**
 * The ladder, as classes.
 *
 * `ink` is the page's own colour and carries no class -- it is what `body`
 * already is, and a class restating that would be a second place to change it.
 */
const TONE: Record<Tone, string | undefined> = {
  inverted: 'bg-ink text-ground',
  ink: undefined,
  prose: 'u-prose',
  dim: 'text-dim',
}

/** Every class that applies, joined, and an empty string where none does. */
const classed = (...names: readonly (string | undefined)[]): string =>
  names.filter((name) => name !== undefined).join(' ')

/**
 * A span's tone, and the one thing that is not a tone.
 *
 * `struck` is orthogonal to the ladder -- #86's abandoned frame strikes a value
 * that is dim underneath -- so it composes with the tone rather than replacing
 * it. Empty comes back as `undefined` rather than as an empty string, so an
 * ordinary `ink` span still renders with no class attribute at all.
 */
const styled = (span: Span): string | undefined => {
  const classes = classed(TONE[span.tone], span.struck === true ? 'line-through' : undefined)

  return classes === '' ? undefined : classes
}

/**
 * What the visitor can run, and what happens without it.
 *
 * A span carrying `runs` becomes a control only when there is somewhere for the
 * click to go. Handed no `onRun` -- which is every use outside the live page --
 * it renders as the plain span it would have been, so this file still produces
 * the same markup with no interactivity in the room. That is the property that
 * keeps a session renderable outside a browser, and `wiring/` asserts it.
 *
 * `copies` and `onCopy` are the same arrangement for #91's copy control, one
 * component down.
 */
export const Landable = ({
  text,
  runs,
  tone,
  onRun,
}: {
  text: string
  runs: string
  tone: Tone
  onRun: (command: string) => void
}) => (
  // **The tone travels, and until #89 it did not have to.** `word()` builds
  // these and is always `ink`, which is what `body` already is, so the class
  // would have restated it. `chip()` is the first landable word with a voice of
  // its own -- `prose`, the human's face -- and the row would silently render
  // in the machine's without this.
  //
  // Still no *colour* here that `word` did not already have. The hover wash is
  // mixed to be legible under one colour, and `prose` moves the typeface and
  // leaves the colour alone; the ticket that makes a landable word `dim`
  // answers ADR-0010's contrast row at the same time.
  <button type="button" className={classed('u-word', TONE[tone])} onClick={() => onRun(runs)}>
    {text}
  </button>
)

/**
 * The other control, and the reason there are two.
 *
 * A `Landable` runs a command; this puts a value on a clipboard and does
 * nothing else. #91 asks that a command left in the scrollback can be copied
 * again *without re-running anything*, so a control that dispatched a command
 * would reprint the block it is standing in every time somebody used it.
 *
 * It is the same word wearing the same class, because the page has no buttons:
 * bare text, an invisible tap target, and the block cursor as the only pointer.
 *
 * **The label is what a screen reader hears instead of `copy` on its own.** One
 * such word was unambiguous and five are not -- #88 put a control on every
 * configured donation row -- and the visible word is inside the accessible
 * name rather than replaced by it, so the two cannot disagree.
 */
const Copier = ({
  text,
  intent,
  onCopy,
}: {
  text: string
  intent: Copying
  onCopy: (intent: Copying) => void
}) => (
  <button
    type="button"
    className="u-word"
    aria-label={`${text} ${intent.what}`}
    onClick={() => onCopy(intent)}
  >
    {text}
  </button>
)

const Row = ({
  line,
  onRun,
  onCopy,
}: {
  line: Line
  onRun?: (command: string) => void
  onCopy?: (intent: Copying) => void
}) => {
  // A blank row is a row, not a margin: it has the height of one line and
  // nothing in it, which is what a terminal shows and what keeps every gap on
  // this page countable.
  if (line.kind === 'blank') return <div className="u-row" aria-hidden="true" />

  // The wordmark. `role="img"` with a label because it is art rather than text,
  // and no newline is stripped on the way in -- the row the mark opens with is
  // a line of the session now, so what is served and what React renders are the
  // same bytes.
  if (line.kind === 'art') {
    return (
      <pre className="u-art" role="img" aria-label={line.label}>
        {line.text}
      </pre>
    )
  }

  return (
    <div className="u-row">
      {line.spans.map((span, index) => {
        if (span.runs !== undefined && onRun !== undefined) {
          return (
            <Landable
              key={index}
              text={span.text}
              runs={span.runs}
              tone={span.tone}
              onRun={onRun}
            />
          )
        }

        if (span.copies !== undefined && onCopy !== undefined) {
          return <Copier key={index} text={span.text} intent={span.copies} onCopy={onCopy} />
        }

        return (
          <span key={index} className={styled(span)} aria-hidden={span.hidden}>
            {span.text}
          </span>
        )
      })}
    </div>
  )
}

/**
 * `onReach` is the odd one out and is worth admitting rather than glossing.
 *
 * `onRun` and `onCopy` are handed to a control the module said was there;
 * this is handed to the whole surface, and it answers a gesture the module
 * has no word for -- #89's *tapping the terminal raises the software
 * keyboard*, which is a tap anywhere that is not a control. It is wiring
 * rather than a decision, which is why it arrives as a prop and is performed
 * in `components/live.tsx`: what it does is move focus, and this file still
 * holds no state and runs no effect.
 *
 * Absent, the surface is inert -- the arrangement `onRun` already has, and
 * what keeps a session renderable outside a browser.
 */
export const Screen = ({
  session,
  onRun,
  onCopy,
  onReach,
}: {
  session: Session
  onRun?: (command: string) => void
  onCopy?: (intent: Copying) => void
  onReach?: () => void
}) => (
  // A click handler on a non-interactive element, knowingly. It adds nothing a
  // keyboard user did not have -- the field it focuses is in the tab order and
  // one Tab away -- so there is no keyboard equivalent to give it and no role
  // to claim. Reaching for either would announce the scrollback as a control.
  <main className="u-session" onClick={onReach}>
    {session.lines.map((line, index) => (
      <Row key={index} line={line} onRun={onRun} onCopy={onCopy} />
    ))}
  </main>
)
