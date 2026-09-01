import type { Readable } from 'node:stream'

/**
 * The streams, and the two questions about them that change what the CLI does.
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
}

/** The real streams. Built in one place, and only by the binary's entry point. */
export const processIo = (): Io => ({
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  in: process.stdin,
  stdoutIsTty: Boolean(process.stdout.isTTY),
  stdinIsTty: Boolean(process.stdin.isTTY),
})
