import { afterAll, describe, expect, it } from 'bun:test'
import pkg from '../package.json'
import { NARROW_MARK } from '../src/header'
import { ENTRIES } from '../src/menu'
import { WORDMARK } from '../src/wordmark'
import { CANCEL, DOWN, ENTER, jukebox, oneObject, removeHomes } from './harness'

/**
 * The menu, driven at Seam 3 like every other command in this suite.
 *
 * No seam of its own, and that is a property of where #51 put the input stream
 * rather than a discipline observed here: the keyboard is on `Io`, so an
 * argument vector and some keystrokes is the whole of driving a menu, the same
 * way an argument vector alone is the whole of driving a command.
 *
 * What is asserted is what a person or a script observes -- what lands on
 * stdout, what lands on stderr, and the exit code. Never which screen the menu
 * thinks it is on or how many times it redrew, which are the parts most likely
 * to change and least likely to matter.
 */

afterAll(removeHomes)

/**
 * From the top of the menu to `quit`, which is the last of five entries.
 *
 * Every run below ends with these, and not for tidiness. The harness's keyboard
 * never closes, so a prompt handed too few keys waits rather than fails -- a
 * test that forgets the way out hangs until the runner gives up.
 */
const QUIT = [DOWN, DOWN, DOWN, DOWN, ENTER]

/**
 * The first row of the art, as it has to arrive on stderr.
 *
 * `header` brackets each row in its own escapes rather than wrapping the block,
 * so the row stays one contiguous run of bytes and this matches whether or not
 * the run drew in colour. Nothing here has to strip escapes first.
 */
const ART = WORDMARK.split('\n')[0]!

/** The brand yellow `header` emits, and the only escape this file asserts about. */
const YELLOW = '\x1b[38;2;255;212;0m'

describe('bare jukebox at a terminal', () => {
  it('shows the wordmark, the version and a menu', async () => {
    const run = await jukebox([], { keys: QUIT })

    expect(run.stderr).toContain(ART)
    expect(run.stderr).toContain(`jukebox ${pkg.version}`)

    // Every entry #50 puts at the top level, whether or not this slice wired it
    // up. `show` and `remove` are deliberately not among them -- #56 reaches
    // them through `list`, so the id nobody memorises is never asked for.
    //
    // The hint carries the assertion and the label rides along: `list` is a
    // substring of `playlist`, which `add`'s hint contains, so a menu that drew
    // four entries would still satisfy a check on the labels alone.
    for (const { label, hint } of ENTRIES) {
      expect(run.stderr).toContain(label)
      expect(run.stderr).toContain(hint)
    }
  })

  it('writes every byte of it to stderr', async () => {
    const run = await jukebox([], { keys: QUIT })

    // The whole of why a menu can exist at all without costing the guarantee
    // `render.ts` makes. stdout is data, and a session that produced no data
    // produced nothing -- not a wordmark, not a prompt, not a redraw.
    expect(run.stdout).toBe('')
  })

  it('exits zero when the person quits', async () => {
    // A session rather than an answer. Exit codes exist for callers, and the
    // entry condition guarantees no caller is here.
    expect((await jukebox([], { keys: QUIT })).code).toBe(0)
  })

  it('leaves on ctrl-c the same way, and says nothing different about it', async () => {
    // In raw mode Ctrl-C is not a signal: the byte reaches the program and the
    // program decides. It decides the same thing `quit` does, because it is how
    // a person says they are finished, and answering it with a failure would
    // make the ordinary way out look like a fault.
    //
    // One key is the whole script. If the loop ever redrew on a cancel instead
    // of returning, this hangs rather than fails -- which is the failure this
    // suite is built to make loud, and the reason the assertion is here at all.
    const run = await jukebox([], { keys: [CANCEL] })

    expect(run.stdout).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('an entry this slice has not wired up', () => {
  it('says what to run instead, and comes back to the menu', async () => {
    // Down one to `sync`, take it, then quit from the menu that comes back.
    // Reaching `quit` at all is the proof that it did come back: the second
    // press of return has nothing to land on otherwise, and the run hangs.
    const run = await jukebox([], { keys: [DOWN, ENTER, ...QUIT] })

    expect(run.stderr).toContain('not in the menu yet')
    expect(run.stderr).toContain('jukebox sync')
    expect(run.stdout).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('the wordmark at the width it is given', () => {
  it('draws the art on a terminal wide enough for it', async () => {
    const run = await jukebox([], { columns: 100, keys: QUIT })

    expect(run.stderr).toContain(ART)
  })

  it('draws the word on one that is not', async () => {
    const run = await jukebox([], { columns: 40, keys: QUIT })

    // Five rows of 67 columns wrapped into a 40-column window is not a smaller
    // mark, it is confetti.
    expect(run.stderr).not.toContain(ART)
    expect(run.stderr).toContain(NARROW_MARK)
  })
})

describe("the wordmark's colour", () => {
  it('is suppressed when the stream it is drawn on is not a terminal', async () => {
    // `jukebox 2>log.txt` at a terminal. The menu still opens, because #50
    // gates that on stdout and stdin -- so the art has to reach the file as
    // bytes somebody can read rather than as escape sequences.
    //
    // Only the brand escape is asserted absent. The prompt library writes
    // cursor moves and colours of its own whatever this run decided, so a
    // blanket check for any escape at all would be asserting something this
    // ticket does not control.
    const run = await jukebox([], { stderrTty: false, keys: QUIT })

    expect(run.stderr).toContain(ART)
    expect(run.stderr).not.toContain(YELLOW)
  })

  // No test asserts the escape is *present*. Whether colour is supported is
  // computed by the colour library from the real process, once, at import --
  // true on Windows, true under CI, and false for somebody piping this suite on
  // Linux. Asserting presence here would pass or fail by platform. That branch
  // is covered where it can be: `header.test.ts` hands the boolean in.
})

describe('everywhere a menu must not open', () => {
  /**
   * No keys anywhere below. Nothing here should reach a prompt to consume them.
   *
   * Two shapes rather than one, because the refusal is rendered by whichever
   * mode the run is in and the two cases genuinely differ: something parsing
   * the output is handed the envelope on stdout, and somebody reading it is
   * handed the sentence on stderr. Both are `invalid_usage` and both exit 1.
   */
  const refusedAsJson = (run: { stdout: string; code: number }) => {
    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'jukebox',
      error: { code: 'invalid_usage' },
    })
    expect(run.code).toBe(1)
  }

  const refusedInWords = (run: { stdout: string; stderr: string; code: number }) => {
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('No command given')
    expect(run.code).toBe(1)
  }

  it('fails in a pipe or a redirect, exactly as it did before', async () => {
    refusedAsJson(await jukebox([], { tty: false }))
  })

  it('fails when nobody is at the keyboard', async () => {
    // A CI job or a cron entry. Asking here is not a slow command, it is a hung
    // one, so a missing answer has to be an error rather than a wait.
    //
    // In words rather than as an envelope: stdout is still a terminal here, so
    // this run is still rendering for a person. Only the keyboard is missing.
    refusedInWords(await jukebox([], { stdin: false }))
  })

  it('fails when JSON was asked for, both streams terminals or not', async () => {
    // The output is being parsed. A menu drawn into it is neither answerable
    // nor valid JSON.
    refusedAsJson(await jukebox(['--json']))
  })

  it('fails on a vector that names no command but is not bare', async () => {
    // `--nonsense` resolves to no command the same way an empty vector does,
    // and must not be answered with a menu that silently swallowed the flag.
    // This is the case the entry condition reads `argv.length` for rather than
    // asking the dispatcher what it found.
    refusedInWords(await jukebox(['--nonsense']))
  })
})
