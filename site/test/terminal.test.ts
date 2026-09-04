import { describe, expect, it } from 'bun:test'
import { CLI_VERSION } from '../lib/content'
import { replay } from '../lib/session/boot'
import { COMMANDS, EMPTIED, PROMPTS, run } from '../lib/session/commands'
import { versionLine } from '../lib/session/header'
import { finished } from '../lib/session'
import { text, type Line, type Session } from '../lib/session/lines'
import { after, booted, KEYS, pause, SCROLLBACK, type Terminal } from '../lib/session/terminal'

/**
 * The live prompt, driven directly.
 *
 * Seam one of three, and where every behaviour in #85 is answered. What the
 * component does with the state is `wiring/`, and anything needing a pixel is
 * `e2e/` -- neither belongs here and this file must not drift into either.
 *
 * The whole of "does nothing" is asserted with `toBe`. Every no-op branch
 * returns the terminal it was handed, so an identity check is the crispest
 * possible statement that a key changed nothing at all.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

const start = (): Terminal => booted(finished(CLI_VERSION))
const typing = (terminal: Terminal, value: string): Terminal =>
  after(terminal, { kind: 'typed', value })
const entering = (terminal: Terminal): Terminal => after(terminal, { kind: 'entered' })
const running = (terminal: Terminal, value: string): Terminal => entering(typing(terminal, value))

describe('booting', () => {
  it('opens on the session the page was served with', () => {
    // #84's floor. The reducer starts from what `finished` computed rather than
    // from anything of its own, so the first frame of the live page and the
    // served HTML are the same rows.
    expect(start().session).toEqual(finished(CLI_VERSION))
  })

  it('asks for nothing to be done', () => {
    // `help` and `clear` write no clipboard and set no timer, so #85 never
    // fills this array and the question of draining it stays #88's.
    expect(running(start(), 'help').session.intents).toEqual([])
  })

  it('starts at rest, with nothing typed and nothing recalled', () => {
    const terminal = start()

    expect(terminal.buffer).toBe('')
    expect(terminal.history).toEqual([])
    expect(terminal.recall).toBe(0)
    expect(terminal.announcement).toBe('')
  })
})

describe('entering a command', () => {
  it('echoes it and prints underneath', () => {
    const drawn = rows(running(start(), 'add').session.lines)

    expect(drawn.at(-2)).toBe(`${PROMPTS.binary}add`)
    expect(drawn.at(-1)).toBe('Track a playlist.')
  })

  it('leaves one blank row between what came before and the echo', () => {
    // The CLI never double-spaces, and neither does this. One row of air
    // between a command and the last one, which is what a terminal shows.
    const drawn = rows(running(start(), 'add').session.lines)

    expect(drawn.at(-3)).toBe('')
  })

  it('empties the prompt', () => {
    expect(running(start(), 'add').buffer).toBe('')
  })

  it('does nothing at all on a blank line', () => {
    const terminal = typing(start(), '   ')

    expect(entering(terminal)).toBe(terminal)
  })
})

describe('clear', () => {
  it('empties the scrollback, its own echo included', () => {
    expect(running(start(), 'clear').session.lines).toEqual([])
  })

  it('says what it did, having printed nothing that could', () => {
    expect(running(start(), 'clear').announcement).toBe(EMPTIED)
  })

  it('opens the next command without a leading blank', () => {
    // There is nothing above it to be separated from.
    const drawn = rows(running(running(start(), 'clear'), 'add').session.lines)

    expect(drawn[0]).toBe(`${PROMPTS.binary}add`)
  })

  it('keeps the history it did not print', () => {
    expect(running(running(start(), 'add'), 'clear').history).toEqual(['add', 'clear'])
  })
})

describe('completion', () => {
  it('finishes a prefix only one command answers to', () => {
    expect(after(typing(start(), 'co'), { kind: 'completed' }).buffer).toBe('config')
  })

  it('adds no trailing space, because nothing takes an argument yet', () => {
    // #87 and #91 add one when there is something to type after it.
    expect(after(typing(start(), 'v'), { kind: 'completed' }).buffer).toBe('version')
  })

  it('does nothing on a prefix two commands answer to', () => {
    // `c` is `clear` and `config`; `s` is `sync` and `show`. A deliberate
    // departure from bash, which would complete the longest common prefix and
    // list the candidates on a second Tab. The criterion says *nothing*, and
    // this is the literal reading of it.
    for (const prefix of ['c', 's']) {
      const terminal = typing(start(), prefix)
      expect(after(terminal, { kind: 'completed' })).toBe(terminal)
    }
  })

  it('does nothing on a prefix no command answers to', () => {
    const terminal = typing(start(), 'zz')
    expect(after(terminal, { kind: 'completed' })).toBe(terminal)
  })

  it('does nothing at an empty prompt, where everything matches', () => {
    const terminal = start()
    expect(after(terminal, { kind: 'completed' })).toBe(terminal)
  })

  it('does nothing once a line has a second word', () => {
    const terminal = typing(start(), 'add fo')
    expect(after(terminal, { kind: 'completed' })).toBe(terminal)
  })
})

describe('history', () => {
  const twice = (): Terminal => running(running(start(), 'add'), 'list')

  it('recalls backwards, newest first', () => {
    const once = after(twice(), { kind: 'earlier' })

    expect(once.buffer).toBe('list')
    expect(after(once, { kind: 'earlier' }).buffer).toBe('add')
  })

  it('stops at the oldest rather than wrapping', () => {
    const oldest = after(after(twice(), { kind: 'earlier' }), { kind: 'earlier' })

    expect(after(oldest, { kind: 'earlier' })).toBe(oldest)
  })

  it('does nothing going forward from the prompt', () => {
    const terminal = twice()
    expect(after(terminal, { kind: 'later' })).toBe(terminal)
  })

  it('gives back what was half-typed', () => {
    // The whole job of `draft`, and the reason recall is not simply an index.
    const half = typing(twice(), 'hel')
    const back = after(after(after(half, { kind: 'earlier' }), { kind: 'earlier' }), {
      kind: 'later',
    })

    expect(after(back, { kind: 'later' }).buffer).toBe('hel')
  })

  it('does not record a blank line', () => {
    expect(entering(typing(start(), '  ')).history).toEqual([])
  })

  it('does not record the same command twice running', () => {
    expect(running(running(start(), 'add'), 'add').history).toEqual(['add'])
  })

  it('records it again when something came between', () => {
    expect(running(running(running(start(), 'add'), 'list'), 'add').history).toEqual([
      'add',
      'list',
      'add',
    ])
  })

  it('returns to the prompt after a command is entered', () => {
    const terminal = running(after(twice(), { kind: 'earlier' }), 'help')

    expect(terminal.recall).toBe(terminal.history.length)
  })
})

describe('what is announced', () => {
  it('speaks what a command printed, and not its echo', () => {
    // The visitor typed the echo; reading it back is reading their own words to
    // them.
    const terminal = running(start(), 'add')

    expect(terminal.announcement).toBe('Track a playlist.')
  })

  it('counts every print, so the same answer twice is announced twice', () => {
    // A live region whose text did not change is one an assistive technology is
    // right to stay quiet about. The count is what the component keys on to
    // replace the node and have it read again.
    const once = running(start(), 'add')
    const twice = running(once, 'list')
    const again = running(twice, 'list')

    expect(once.printed).toBe(1)
    expect(again.printed).toBe(3)
    expect(again.announcement).toBe(twice.announcement)
  })

  it('says nothing new when a key printed nothing', () => {
    // Structural rather than conventional: typing, completing and recalling all
    // hand back the same two values, so a keystroke can never re-announce.
    const terminal = running(start(), 'add')

    for (const input of [
      { kind: 'typed', value: 'li' },
      { kind: 'completed' },
      { kind: 'earlier' },
      { kind: 'later' },
    ] as const) {
      const next = after(terminal, input)
      expect(next.announcement).toBe(terminal.announcement)
      expect(next.printed).toBe(terminal.printed)
    }
  })
})

describe('a word that was clicked', () => {
  it('is the word typed and entered, exactly', () => {
    // Composition rather than a second path, so a clicked word and a typed one
    // cannot drift.
    expect(after(start(), { kind: 'chosen', command: 'help' })).toEqual(running(start(), 'help'))
  })
})

describe('the scrollback', () => {
  it('caps, and lets the oldest rows go', () => {
    // Driven with a real command rather than fabricated lines, so the cap is
    // measured against what the page actually prints.
    let terminal = start()
    for (let index = 0; index < 100; index += 1) {
      terminal = after(terminal, { kind: 'chosen', command: 'help' })
    }

    expect(terminal.session.lines).toHaveLength(SCROLLBACK)
    expect(rows(terminal.session.lines)).not.toContain(`jukebox ${CLI_VERSION}`)
  })

  it('lets the wordmark scroll away rather than pinning it', () => {
    // What a terminal does. Pinning it would make the page a frame around a
    // log, which is the one thing ADR-0010 is trying not to be.
    let terminal = start()
    for (let index = 0; index < 100; index += 1) {
      terminal = after(terminal, { kind: 'chosen', command: 'help' })
    }

    expect(terminal.session.lines.some((line) => line.kind === 'art')).toBe(false)
  })

  it('stays under the cap until it reaches it', () => {
    expect(running(start(), 'add').session.lines.length).toBeLessThan(SCROLLBACK)
  })
})

describe('the grid, through every command there is', () => {
  // `clear` is left out because it prints nothing and would empty the very
  // thing being measured. Its own grid is asserted above, on an empty list.
  const everything = (): Terminal =>
    COMMANDS.filter((command) => command.name !== 'clear').reduce(
      (terminal, command) => running(terminal, command.name),
      start(),
    )

  it('never leaves a gap of two lines', () => {
    const lines = everything().session.lines

    expect(
      lines.some((line, index) => line.kind === 'blank' && lines[index + 1]?.kind === 'blank'),
    ).toBe(false)
  })

  it('never offsets with a tab', () => {
    expect(rows(everything().session.lines).some((line) => line.includes('\t'))).toBe(false)
  })
})

describe('the keymap', () => {
  it('says which keystroke means what, so the component only looks it up', () => {
    // Published as data rather than left in a switch in the component, so that
    // "Tab completes" is a fact this module states and this file can read.
    expect(KEYS).toEqual({
      Enter: 'entered',
      Tab: 'completed',
      ArrowUp: 'earlier',
      ArrowDown: 'later',
    })
  })
})

describe('purity', () => {
  it('answers the same twice', () => {
    expect(running(start(), 'help')).toEqual(running(start(), 'help'))
  })
})

/** A terminal with the boot replay running, standing on its first frame. */
const replaying = (): Terminal => after(start(), { kind: 'replayed' })

describe('the boot replay', () => {
  const advancing = (terminal: Terminal): Terminal => after(terminal, { kind: 'advanced' })

  /** The replay, run to its end the way the component's timer would. */
  const throughout = (terminal: Terminal): Terminal => {
    let running = terminal
    while (pause(running) !== undefined) running = advancing(running)
    return running
  }

  it('does not start on its own', () => {
    // The reducer opens on the session the page was served with, and #84 is an
    // enhancement over that rather than a replacement for it. A visitor whose
    // JavaScript never ran, or who asked for reduced motion, gets exactly this
    // state -- so nothing here may begin without being told to.
    expect(pause(start())).toBeUndefined()
    expect(start().session).toEqual(finished(CLI_VERSION))
  })

  it('rewinds to the first frame when it is told to', () => {
    const terminal = replaying()

    expect(terminal.session.lines).toEqual(replay(finished(CLI_VERSION))[0]!.lines)
    expect(pause(terminal)).toBe(replay(finished(CLI_VERSION))[0]!.hold)
  })

  it('reaches the session the page was served with, and stops there', () => {
    const terminal = throughout(replaying())

    expect(terminal.session).toEqual(finished(CLI_VERSION))
    expect(pause(terminal)).toBeUndefined()
  })

  it('starts again from the beginning if it is told to twice', () => {
    // React runs an effect twice under StrictMode, so `dev` dispatches this
    // twice on one mount. Rewinding is what makes that a boot rather than two.
    expect(after(replaying(), { kind: 'replayed' }).session.lines).toEqual(
      replaying().session.lines,
    )
  })

  it('asks for nothing to be done, all the way through', () => {
    // The timing is a number in the frame rather than an intent, because a
    // timer is the one effect that has to be cancelled and an intent carries no
    // handle to cancel. So this array stays #88's to fill.
    expect(replaying().session.intents).toEqual([])
    expect(throughout(replaying()).session.intents).toEqual([])
  })
})

describe('reaching the end of the boot early', () => {
  const served = (): Session => finished(CLI_VERSION)

  it('is what a skip does, in one step', () => {
    const terminal = after(replaying(), { kind: 'skipped' })

    expect(terminal.session).toEqual(served())
    expect(pause(terminal)).toBeUndefined()
  })

  it('is what every other input does too, on its way to doing its own job', () => {
    // **The whole of "any keypress skips", said once.** A listener in the
    // component could say it for a keystroke, and could not say it for a word
    // that was clicked -- which would otherwise print into a partial session
    // that the next frame overwrites. Collapsing here makes the hazard
    // unreachable rather than handled.
    for (const input of [
      { kind: 'typed', value: 'he' },
      { kind: 'completed' },
      { kind: 'earlier' },
      { kind: 'later' },
      { kind: 'entered' },
    ] as const) {
      const terminal = after(replaying(), input)

      expect(pause(terminal), `${input.kind} left the boot running`).toBeUndefined()
      expect(rows(terminal.session.lines), `${input.kind} lost the session`).toContain(
        versionLine(CLI_VERSION),
      )
    }
  })

  it('is what a clicked word does, before the word runs', () => {
    const terminal = after(replaying(), { kind: 'chosen', command: 'help' })
    const drawn = rows(terminal.session.lines)

    // The boot arrived whole, and the command printed underneath it rather than
    // into the middle of a mark that was still being drawn.
    expect(drawn).toContain(versionLine(CLI_VERSION))
    expect(drawn.at(-1)).toBe(text(run('help').body.at(-1)!))
  })

  it('leaves a terminal that was never replaying exactly as it was', () => {
    // The invariant `terminal.ts` states of itself -- every branch that changes
    // nothing returns the terminal it was handed -- now has to survive a
    // collapse that runs ahead of every input. With no boot in flight it must
    // hand back the same object, or eight `toBe` assertions above go red at once
    // and the shape of "does nothing" is gone.
    const terminal = start()

    for (const input of [
      { kind: 'completed' },
      { kind: 'earlier' },
      { kind: 'later' },
      { kind: 'entered' },
      { kind: 'skipped' },
      { kind: 'advanced' },
    ] as const) {
      expect(after(terminal, input), `${input.kind} rebuilt a terminal it did not change`).toBe(
        terminal,
      )
    }
  })
})
