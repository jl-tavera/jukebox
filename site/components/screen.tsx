import type { Line, Session, Span, Tone } from '@/lib/session/lines'

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

/**
 * A span's tone, and the one thing that is not a tone.
 *
 * `struck` is orthogonal to the ladder -- #86's abandoned frame strikes a value
 * that is dim underneath -- so it composes with the tone rather than replacing
 * it. Empty comes back as `undefined` rather than as an empty string, so an
 * ordinary `ink` span still renders with no class attribute at all.
 */
const styled = (span: Span): string | undefined => {
  const classes = [TONE[span.tone], span.struck === true ? 'line-through' : undefined].filter(
    (name) => name !== undefined,
  )

  return classes.length === 0 ? undefined : classes.join(' ')
}

/**
 * What the visitor can run, and what happens without it.
 *
 * A span carrying `runs` becomes a control only when there is somewhere for the
 * click to go. Handed no `onRun` -- which is every use outside the live page --
 * it renders as the plain span it would have been, so this file still produces
 * the same markup with no interactivity in the room. That is the property that
 * keeps a session renderable outside a browser, and `wiring/` asserts it.
 */
const Landable = ({
  text,
  runs,
  onRun,
}: {
  text: string
  runs: string
  onRun: (command: string) => void
}) => (
  // No tone class. `word()` builds these and is always `ink`, which is what
  // `body` already is -- and it is always `ink` for a reason worth not
  // undoing here: the hover wash is mixed to be legible under one colour. The
  // ticket that makes a landable word dim adds the class and answers ADR-0010's
  // contrast row at the same time.
  <button type="button" className="u-word" onClick={() => onRun(runs)}>
    {text}
  </button>
)

const Row = ({ line, onRun }: { line: Line; onRun?: (command: string) => void }) => {
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
      {line.spans.map((span, index) =>
        span.runs !== undefined && onRun !== undefined ? (
          <Landable key={index} text={span.text} runs={span.runs} onRun={onRun} />
        ) : (
          <span key={index} className={styled(span)} aria-hidden={span.hidden}>
            {span.text}
          </span>
        ),
      )}
    </div>
  )
}

export const Screen = ({
  session,
  onRun,
}: {
  session: Session
  onRun?: (command: string) => void
}) => (
  <main className="u-session">
    {session.lines.map((line, index) => (
      <Row key={index} line={line} onRun={onRun} />
    ))}
  </main>
)
