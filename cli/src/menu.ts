import { Writable } from 'node:stream'
import { isCancel, select } from '@clack/prompts'
import pc from 'picocolors'
import { header } from './header'
import type { Io } from './io'
import { VERSION } from './version'

/**
 * The menu: what `jukebox` does when a person runs it with nothing to run.
 *
 * **A launcher, not a surface.** An entry here runs a command that already
 * exists, with its arguments collected by prompt instead of typed, and renders
 * the result object that command already returns. Nothing is to be reachable
 * here that flags cannot reach, and the menu adds no behaviour of its own --
 * which is what keeps `main`'s compute-then-render shape, and so keeps machine
 * output a property of `main` rather than of each command. That is
 * docs/adr/0007, and it is the constraint every later ticket in #50 inherits.
 *
 * **#54 wires `quit` and nothing else.** It is the tracer bullet: the path from
 * a bare invocation to a menu and back out to a shell exists end to end, and
 * the four entries that reach a command name the command instead of running it.
 * #55, #56 and #57 replace one of those lines each. Read the paragraph above as
 * the rule the file is built to, not as a description of what it does today --
 * `USAGE` below is where today is written down.
 *
 * **Everything written here is chrome, and chrome goes to stderr.** `render.ts`
 * keeps stdout, and keeps it alone, so "stdout is the guarantee" survives a
 * second writer existing at all. A test asserts it the only way worth asserting
 * it: drive the menu, and read nothing on stdout.
 *
 * **The normal buffer, deliberately.** No alternate screen. A full-screen app
 * restores the terminal on the way out and takes every result the session
 * printed with it, which would make the menu strictly worse than the commands
 * it launches. What is left in the scrollback is the same text the flags would
 * have produced.
 */

/** The top level. One entry per command #50 puts here, and the way out. */
type Entry = 'add' | 'sync' | 'list' | 'config' | 'quit'

/**
 * The entries, in the order #50 sets: the two that reach the network, the two
 * that read only local state, then the way out.
 *
 * Exported so that a test pins these rather than a paraphrase of them, the way
 * `remove.ts` exports the sentence it has to say. The hints are what a test can
 * actually discriminate on -- three of the five labels are substrings of some
 * other word on screen, and `list` is a substring of `playlist`.
 *
 * `show` and `remove` are deliberately absent. #56 reaches them through `list`
 * -- pick a Playlist, land on its `show`, and stop tracking it from there -- so
 * that the id nobody memorises is never asked for.
 */
export const ENTRIES: { value: Entry; label: string; hint: string }[] = [
  { value: 'add', label: 'add', hint: 'Track a playlist' },
  { value: 'sync', label: 'sync', hint: 'Ask every playlist what changed' },
  { value: 'list', label: 'list', hint: 'Every playlist you track' },
  { value: 'config', label: 'config', hint: 'Settings, and where each value came from' },
  { value: 'quit', label: 'quit', hint: 'Leave the menu' },
]

/**
 * What to type instead, for an entry this slice has not wired up yet.
 *
 * #54 is the tracer bullet: the whole path from a bare invocation to a menu and
 * back out exists, and `quit` is the only entry that does anything. The four
 * below arrive with #55, #56 and #57, each replacing its own line here.
 *
 * They are listed rather than hidden, and rather than shown greyed out -- the
 * prompt library offers a `disabled` flag that would do it. An entry nobody can
 * land on exercises none of the select-and-come-back path, which is the whole
 * of what this ticket exists to prove.
 */
const USAGE: Record<Exclude<Entry, 'quit'>, string> = {
  add: 'jukebox add <url>',
  sync: 'jukebox sync',
  list: 'jukebox list',
  config: 'jukebox config',
}

/**
 * The error sink, as something the prompt library can write to.
 *
 * Its prompts each take an `input`, an `output` and a signal, and `Io.err` is a
 * function rather than a stream. Strings are left as strings rather than
 * decoded from a buffer, so a multi-byte character cannot be split across two
 * writes and arrive as two broken ones.
 */
const writingTo = (io: Io): Writable =>
  new Writable({
    decodeStrings: false,
    write(chunk: unknown, _encoding, done) {
      io.err(typeof chunk === 'string' ? chunk : String(chunk))
      done()
    },
  })

/**
 * Runs until the person quits, and answers with the session's exit code.
 *
 * **Always zero.** Exit codes exist for callers, and no caller can reach this:
 * the entry condition in `main` is that both streams are terminals, so the only
 * reader is a shell prompt. Reporting failure for something that failed earlier
 * in a session the person then chose to carry on with and leave is noise. #55
 * adds the one exception #50 names -- a version gate refusing this binary, which
 * closes the menu because nothing in the session was usable.
 *
 * Ctrl-C leaves the same way `quit` does. It is how a person says they are
 * finished with a menu, and answering it with a failure would make the ordinary
 * way out look like a fault.
 */
export const menu = async (io: Io): Promise<number> => {
  const output = writingTo(io)

  // Two halves, and each covers what the other cannot.
  //
  // The library is where `NO_COLOR`, `--no-color` and a dumb terminal are
  // honoured, and it is the check #54 asks for by name. What it cannot answer
  // is this run's own streams: it reads the real process, and on Windows it
  // says yes unconditionally, pipe or no pipe.
  //
  // The stream it is asked about is the error one, because that is where every
  // byte below goes. Asking about stdout would be asking about a stream this
  // function never writes to -- and, worse, one the entry condition has already
  // guaranteed is a terminal, so the guard could never fire. `2>log.txt` at a
  // terminal is the case that makes the difference visible.
  const colour = pc.isColorSupported && io.stderrIsTty

  try {
    io.err(header(io.columns, VERSION, colour) + '\n\n')

    for (;;) {
      const chosen = await select<Entry>({
        message: 'What next?',
        options: ENTRIES,
        input: io.in,
        output,
      })

      if (isCancel(chosen) || chosen === 'quit') return 0

      io.err(`\`${chosen}\` is not in the menu yet. Run \`${USAGE[chosen]}\` for now.\n\n`)
    }
  } finally {
    // Handed back before the process is left to end on its own. `index.ts` sets
    // an exit code rather than calling `process.exit`, so a stdin still flowing
    // is an event loop still alive -- a binary that drew a menu, took the quit,
    // and then sat there.
    io.in.pause()
  }
}
