import type { Line, Session, Tone } from '@/lib/session/lines'

/**
 * The one thing that writes.
 *
 * `cli/src/render.ts` says of itself that it is the only place anything is
 * written, and everything upstream of it computes and prints nothing on the
 * way. This is that file for the page: it is handed a session and turns it into
 * markup, and it holds no state, runs no effect and makes no decision the
 * module did not already make.
 *
 * A server component, deliberately and load-bearingly. Every row is in the
 * served HTML, so the page is whole for a crawler, for a screen reader, for a
 * visitor whose JavaScript failed and for one who has asked for reduced motion
 * -- and #84's typing is an enhancement over that floor rather than the only
 * way to see the page. Nothing here may become a client component; the moment
 * it does, that guarantee is gone and nothing fails loudly.
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

const Row = ({ line }: { line: Line }) => {
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
      {line.spans.map((span, index) => (
        <span key={index} className={TONE[span.tone]} aria-hidden={span.hidden}>
          {span.text}
        </span>
      ))}
    </div>
  )
}

export const Screen = ({ session }: { session: Session }) => (
  <main className="u-session">
    {session.lines.map((line, index) => (
      <Row key={index} line={line} />
    ))}
  </main>
)
