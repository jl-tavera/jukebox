import type { Readable } from 'node:stream'

/**
 * The streams, and the four questions about them that change what the CLI does.
 *
 * Handed to `main` rather than reached for. A test hands over its own and reads
 * back what a command wrote, the way `worker/test/api.ts` hands the worker
 * bindings of its own -- nothing in here is shaped differently to make that
 * possible.
 */
export type Io = {
  /**
   * Data, and only data. In JSON mode exactly one object is written here, by
   * the renderer, and nothing else writes here at all.
   */
  out: (text: string) => void
  /**
   * Everything that is not data: a failure's message, and a warning.
   *
   * Both in either rendering. A caller parsing JSON reads stdout and never
   * this, so a warning here costs that guarantee nothing -- and #33's fallback
   * onto an old discovery document is exactly the thing the machine caller is
   * most likely to want to know about.
   */
  err: (text: string) => void
  /**
   * The keyboard `stdinIsTty` below has always asked about, and until #51 had
   * no way to read.
   *
   * Here rather than in `Seams`, and the distinction is the one `main` already
   * draws: a seam reaches a path the real program has no way to reach, and
   * stdin is an ordinary stream the real program reads normally. Putting it
   * there would have made a prompt something only a test could drive.
   *
   * A stream rather than a `(): Promise<string>`, because the prompt library
   * reads it and wants somewhere to attach a keypress listener. A callback
   * would mean re-implementing arrow keys.
   */
  in: Readable
  /** Whether someone is reading the output, or something is parsing it. */
  stdoutIsTty: boolean
  /** Whether anybody is there to answer a question. */
  stdinIsTty: boolean
  /**
   * Whether the stream everything-that-is-not-data goes to is a terminal.
   *
   * Asked separately from `stdoutIsTty` because the two genuinely differ, and
   * the menu is where it first matters: all of its chrome is written to `err`,
   * so whether that chrome may carry colour is a question about this stream and
   * not about the one carrying results. `jukebox 2>log.txt` at a terminal is the
   * case -- gating colour on stdout there writes escape sequences into a file.
   *
   * It is deliberately not part of what opens the menu. #50 settled that on
   * stdout and stdin, and a third stream in that condition would mean a person
   * who redirected their logs quietly lost the menu instead of their colour.
   */
  stderrIsTty: boolean
  /**
   * How wide that someone's terminal is, for the one thing that has a natural
   * width: #52's wordmark is 67 columns on every row of art, and a terminal
   * narrower than that wraps each row onto the next until the mark is noise
   * rather than a smaller mark. The blank row it opens with since #68 is the
   * one exception, and measures nothing.
   *
   * Here for the same reason the input stream is, and against the same
   * alternative: `Seams` is for paths the real program cannot reach, and the
   * width of a terminal is an ordinary thing the real program reads. Reaching
   * for `process.stdout.columns` from wherever the art is drawn would work and
   * would put the narrow branch out of reach of every test that drives `main`.
   *
   * Eighty where there is no terminal to ask, which is the historical default
   * and never consulted in practice -- the only reader is the menu, and the
   * menu opens only when both streams are terminals.
   */
  columns: number
  /**
   * How tall it is, for the one thing that needs a bottom as well as a top:
   * #66 pins the wordmark by fencing the rows under it into a scroll region,
   * and a region is written as two row numbers.
   *
   * Here rather than in `Seams` for `columns`' reason, and against the same
   * alternative. The height of a terminal is an ordinary thing the real program
   * reads, and reaching for `process.stdout.rows` from where the region is set
   * would put the too-short branch -- a window with no room to pin anything in
   * -- out of reach of every test that drives `main`.
   *
   * Twenty-four where there is no terminal to ask, which is the historical
   * default and, like the eighty above it, never consulted in practice.
   */
  rows: number
}

/** What a terminal is assumed to be when there is none to measure. */
const ASSUMED_COLUMNS = 80
const ASSUMED_ROWS = 24

/** The real streams. Built in one place, and only by the binary's entry point. */
export const processIo = (): Io => ({
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  in: process.stdin,
  stdoutIsTty: Boolean(process.stdout.isTTY),
  stdinIsTty: Boolean(process.stdin.isTTY),
  stderrIsTty: Boolean(process.stderr.isTTY),
  columns: process.stdout.columns ?? ASSUMED_COLUMNS,
  rows: process.stdout.rows ?? ASSUMED_ROWS,
})
