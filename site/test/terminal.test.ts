import { describe, expect, it } from 'bun:test'
import { CLI_VERSION, MENU_ENTRIES, WHAT_NEXT } from '../lib/content'
import { replay } from '../lib/session/boot'
import { COMMANDS, EMPTIED, PROMPTS, run } from '../lib/session/commands'
import { versionLine } from '../lib/session/header'
import { finished } from '../lib/session'
import { spoken, text, type Line, type Open, type Session } from '../lib/session/lines'
import { commandFor, copying, PICKER } from '../lib/session/install'
import { RESTING } from '../lib/session/theme'
import {
  asking,
  BAR,
  BAR_END,
  LEGEND,
  RADIO_ACTIVE,
  STEP,
  STEP_DONE,
  STEP_LEFT,
} from '../lib/session/select'
import {
  after,
  booted,
  KEYS,
  pause,
  SCROLLBACK,
  UNFOCUSED,
  type Terminal,
} from '../lib/session/terminal'

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

/**
 * The page with the menu closed and nothing else done to it.
 *
 * `start()` is served with a live menu -- the boot ends on a question -- so an
 * empty prompt belongs to the widget and Enter answers it. Every case about a
 * *free* prompt starts from here instead: up once wraps onto the way out, Enter
 * takes it, and what is left is the same terminal with no question on it and
 * nothing in its history.
 */
const free = (): Terminal => after(after(start(), { kind: 'earlier' }), { kind: 'entered' })

/**
 * The one row of the open frame carrying the cursor, read off the rows rather
 * than out of the state -- a visitor can see which row is active and cannot see
 * an index, and this file asserts what a visitor could observe.
 */
const onCursor = (terminal: Terminal): string | undefined =>
  rows(terminal.session.lines).find((line) => line.includes(RADIO_ACTIVE))

/** The row the frame draws for the entry at `at`, cursor standing on it. */
const cursorOn = (at: number): string =>
  `${BAR}  ${RADIO_ACTIVE} ${MENU_ENTRIES[at]!.label} (${MENU_ENTRIES[at]!.hint})`

describe('booting', () => {
  it('opens on the session the page was served with', () => {
    // #84's floor. The reducer starts from what `finished` computed rather than
    // from anything of its own, so the first frame of the live page and the
    // served HTML are the same rows.
    expect(start().session).toEqual(finished(CLI_VERSION))
  })

  it('asks for nothing to be done', () => {
    // `help` and `clear` write no clipboard and change no theme, so this
    // array is empty after them however many kinds of intent exist. The
    // question of draining it never arose: #91 replaced the array on the
    // transition that declares one instead.
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
    // *What* it prints is `commands.ts`'s and is asserted there. What this seam
    // owns is where the two go: the echo above, the body below, however many
    // rows the body turns out to be -- since #87 a binary command answers with a
    // whole generated help block rather than with one line.
    const body = rows(run('add', RESTING).body)
    const drawn = rows(running(start(), 'add').session.lines)

    expect(drawn.at(-body.length - 1)).toBe(`${PROMPTS.binary}add`)
    expect(drawn.slice(-body.length)).toEqual(body)
  })

  it('leaves one blank row between what came before and the echo', () => {
    // The CLI never double-spaces, and neither does this. One row of air
    // between a command and the last one, which is what a terminal shows.
    const body = rows(run('add', RESTING).body)
    const drawn = rows(running(start(), 'add').session.lines)

    expect(drawn.at(-body.length - 2)).toBe('')
  })

  it('empties the prompt', () => {
    expect(running(start(), 'add').buffer).toBe('')
  })

  it('does nothing at all on a blank line', () => {
    const terminal = typing(free(), '   ')

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

  it('adds no trailing space after a command that takes none', () => {
    // A phantom space under the caret with nothing to type into it. Every
    // command but `help` is this case today; #91's `install` is the next that
    // will not be.
    expect(after(typing(start(), 'v'), { kind: 'completed' }).buffer).toBe('version')
  })

  it('adds one after a command that does take an argument', () => {
    // `help` is the one, and #87 is what gave it one. The space is the whole
    // difference between completing a word and being ready for the next.
    expect(after(typing(start(), 'hel'), { kind: 'completed' }).buffer).toBe('help ')
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

  it('does nothing in a second word after a command that takes none', () => {
    // `add` answers about itself here and is never handed an argument, so there
    // is nothing this could be completing towards.
    const terminal = typing(start(), 'add fo')
    expect(after(terminal, { kind: 'completed' })).toBe(terminal)
  })

  it('finishes a command name in the second word, after `help`', () => {
    expect(after(typing(start(), 'help co'), { kind: 'completed' }).buffer).toBe('help config')
  })

  it('completes what the verb actually takes, rather than a command name', () => {
    // **The defect #88 made reachable, and the reason `takes` exists.** Every
    // second word was completed against the command registry, because `help`
    // was the only verb taking an argument and a command name is what it
    // takes. `install v` had the same shape and nobody ever typed it; `theme
    // l` is what somebody types on the way to `theme light`, and it completed
    // to `theme list` -- a line that runs, and does something else.
    expect(after(typing(start(), 'theme l'), { kind: 'completed' }).buffer).toBe('theme light')
    expect(after(typing(start(), 'theme d'), { kind: 'completed' }).buffer).toBe('theme dark')
    expect(after(typing(start(), 'theme s'), { kind: 'completed' }).buffer).toBe('theme system')
    expect(after(typing(start(), 'install m'), { kind: 'completed' }).buffer).toBe('install macos')
    expect(after(typing(start(), 'install l'), { kind: 'completed' }).buffer).toBe('install linux')
  })

  it('still completes a command name after the one verb that takes one', () => {
    // `help` carries no list, and the absence is what means *a command name*.
    expect(after(typing(start(), 'help ver'), { kind: 'completed' }).buffer).toBe('help version')
    expect(after(typing(start(), 'help don'), { kind: 'completed' }).buffer).toBe('help donate')
  })

  it('finishes the two verbs #88 added, and gives a space to only one', () => {
    // `d` and `t` start nothing else, so both arrive unambiguous. Only `theme`
    // has a word to type after it.
    expect(after(typing(start(), 'd'), { kind: 'completed' }).buffer).toBe('donate')
    expect(after(typing(start(), 't'), { kind: 'completed' }).buffer).toBe('theme ')
  })

  it('does nothing on a bare `help `, where everything matches', () => {
    // The empty-prompt rule one word along: every command answers to an empty
    // prefix, so none of them is the only one.
    const terminal = typing(start(), 'help ')
    expect(after(terminal, { kind: 'completed' })).toBe(terminal)
  })

  it('does nothing on a second word two commands answer to', () => {
    const terminal = typing(start(), 'help c')
    expect(after(terminal, { kind: 'completed' })).toBe(terminal)
  })

  it('leaves a third word alone', () => {
    // `help` takes one command, and `run` says so when it is handed more. A
    // completion here would be filling in a word that is about to be reported
    // as unusable.
    const terminal = typing(start(), 'help add sy')
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
    expect(entering(typing(free(), '  ')).history).toEqual([])
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

    expect(terminal.announcement).toContain(spoken(run('add', RESTING).body[0]!))
    expect(terminal.announcement).not.toContain(PROMPTS.binary)
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

  it('says which of them a page nobody has clicked on still answers', () => {
    // The page boots with a question on it and nothing focused, so the keys the
    // question owns have to arrive at the window or the menu's own gesture does
    // nothing until somebody clicks. These three, and their meanings are the
    // ones above rather than a second opinion about the same keys.
    expect(UNFOCUSED).toEqual({
      Enter: 'entered',
      ArrowUp: 'earlier',
      ArrowDown: 'later',
    })

    for (const [key, kind] of Object.entries(UNFOCUSED)) {
      expect(KEYS[key], `${key} means two different things`).toBe(kind)
    }
  })

  it('leaves Tab out of them, because focus has to be able to walk', () => {
    // Cancelling Tab at the window would trap focus on the page: it is how a
    // keyboard user reaches the prompt in the first place. `e2e/prompt.spec.ts`
    // found the same bug at the field once, from the other side.
    expect(UNFOCUSED['Tab']).toBeUndefined()
    expect(KEYS['Tab']).toBe('completed')
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
    // handle to cancel. A replay is the page redrawing what it was served, so
    // it asks for nothing that was not already asked for.
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
    expect(drawn.at(-1)).toBe(text(run('help', RESTING).body.at(-1)!))
  })

  it('is not what the theme arriving does, and that is the exemption', () => {
    // **The one input that must not reach the end of the boot.** It is not
    // something a visitor did: the provider publishes it from a mount effect,
    // before anybody has touched the page -- so a collapse on it would skip
    // the replay for every visitor who has ever chosen a theme, and for the
    // rest the moment it settled on following their system. #84's rule is that
    // *any keypress* skips, and this is not one.
    const terminal = after(replaying(), {
      kind: 'preferred',
      preference: { theme: 'dark', system: 'dark' },
    })

    expect(pause(terminal)).toBe(pause(replaying()))
  })

  it('leaves a terminal that was never replaying exactly as it was', () => {
    // The invariant `terminal.ts` states of itself -- every branch that changes
    // nothing returns the terminal it was handed -- now has to survive a
    // collapse that runs ahead of every input. With no boot in flight it must
    // hand back the same object, or eight `toBe` assertions above go red at once
    // and the shape of "does nothing" is gone.
    //
    // Measured with the menu closed, since #86: an arrow and an Enter both do
    // something while a question is open, which is the whole of that ticket.
    const terminal = free()

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

describe('the menu, which the boot leaves open', () => {
  it('moves the cursor down a row', () => {
    expect(onCursor(after(start(), { kind: 'later' }))).toBe(cursorOn(1))
  })

  it('moves it up, wrapping onto the way out', () => {
    // The fifth of five entries is `quit`, so wrapping is the difference
    // between one keystroke and four for the row a visitor is most likely to
    // want. The library wraps; so does this.
    expect(onCursor(after(start(), { kind: 'earlier' }))).toBe(cursorOn(4))
  })

  it('redraws the frame where it stands rather than printing a second one', () => {
    const moved = after(start(), { kind: 'later' })

    expect(rows(moved.session.lines).length).toBe(rows(start().session.lines).length)
    expect(rows(moved.session.lines).filter((line) => line.includes(RADIO_ACTIVE)).length).toBe(1)
  })
})

describe('answering the menu', () => {
  /** Enter at an empty prompt, which is what the widget's own legend offers. */
  const confirming = (terminal: Terminal): Terminal => after(terminal, { kind: 'entered' })

  it('collapses the frame onto the row that was chosen', () => {
    const drawn = rows(confirming(start()).session.lines)

    expect(drawn).toContain(`${STEP_DONE}  ${WHAT_NEXT}`)
    expect(drawn).toContain(`${BAR}  ${MENU_ENTRIES[0]!.label}`)
    expect(drawn.some((line) => line.includes(LEGEND))).toBe(false)
    expect(drawn.some((line) => line.includes(RADIO_ACTIVE))).toBe(false)
  })

  it('runs what the row launches, under the frame it collapsed', () => {
    // ADR-0007: the menu is a launcher, and an entry runs the command that
    // already exists. The page quotes that -- what an entry prints is what the
    // command prints, echo and all, so nothing learned here is wrong at a real
    // prompt.
    const drawn = rows(confirming(start()).session.lines)
    const body = rows(run(MENU_ENTRIES[0]!.runs!, RESTING).body)

    expect(drawn.at(-body.length - 1)).toBe(`${PROMPTS.binary}${MENU_ENTRIES[0]!.label}`)
    expect(drawn.slice(-body.length)).toEqual(body)
  })

  it('records what it launched, the way a clicked word does', () => {
    expect(confirming(start()).history).toEqual([MENU_ENTRIES[0]!.label])
  })

  it('takes the row the cursor was moved onto', () => {
    const drawn = rows(confirming(after(start(), { kind: 'later' })).session.lines)

    expect(drawn).toContain(`${BAR}  ${MENU_ENTRIES[1]!.label}`)
    expect(drawn.slice(-1 * rows(run(MENU_ENTRIES[1]!.runs!, RESTING).body).length)).toEqual(
      rows(run(MENU_ENTRIES[1]!.runs!, RESTING).body),
    )
  })
})

describe('the way out', () => {
  /** Up once from the top wraps onto `quit`; Enter takes it. */
  const quitting = (): Terminal =>
    after(after(start(), { kind: 'earlier' }), { kind: 'entered' })

  it('closes the menu and prints nothing at all', () => {
    const drawn = rows(quitting().session.lines)

    expect(drawn.at(-3)).toBe(BAR)
    expect(drawn.at(-2)).toBe(`${STEP_DONE}  ${WHAT_NEXT}`)
    expect(drawn.at(-1)).toBe(`${BAR}  quit`)
  })

  it('lands at the free prompt, with nothing typed', () => {
    expect(quitting().buffer).toBe('')
  })

  it('leaves the arrows to the history they belong to', () => {
    // The menu is over, so the keys go back to being #85's. With nothing in the
    // history there is nothing to recall, and the terminal is handed straight
    // back -- which is this file's own shape for "did nothing".
    const left = quitting()

    expect(after(left, { kind: 'earlier' })).toBe(left)
    expect(after(left, { kind: 'later' })).toBe(left)
  })
})

describe('typing at a prompt with a question above it', () => {
  it('answers the question when the word names a row', () => {
    // The menu shows five words. A visitor who reads one and types it means
    // that row, and lands on the screen Enter on that row would have left --
    // the frame collapsed onto `sync`, and what `sync` prints under it.
    const typed = running(start(), 'sync')
    const chosen = after(after(start(), { kind: 'later' }), { kind: 'entered' })

    expect(rows(typed.session.lines)).toEqual(rows(chosen.session.lines))
    expect(typed.history).toEqual(chosen.history)

    // The two differ in one number and it is the right one: walking the cursor
    // onto the row announced it, so a screen reader was told two things on that
    // path and one on this.
    expect(typed.printed).toBe(chosen.printed - 1)
  })

  it('takes the way out by name, which is the only place `quit` means anything', () => {
    const drawn = rows(running(start(), 'quit').session.lines)

    expect(drawn.at(-1)).toBe(`${BAR}  quit`)
    expect(drawn.some((line) => line.includes('command not found'))).toBe(false)
  })

  it('leaves the question behind when the word is not one of its rows', () => {
    // The library's cancel, which is what Ctrl-C draws at the real menu. The
    // struck row is the record that nothing was chosen.
    const drawn = rows(running(start(), 'help').session.lines)
    const left = drawn.indexOf(`${STEP_LEFT}  ${WHAT_NEXT}`)

    expect(left).toBeGreaterThan(-1)
    expect(drawn[left + 1]).toBe(`${BAR}  ${MENU_ENTRIES[0]!.label}`)
    expect(drawn.some((line) => line.includes(LEGEND))).toBe(false)
    expect(drawn.some((line) => line.includes(STEP))).toBe(false)
  })

  it('prints what it was asked for underneath', () => {
    const drawn = rows(running(start(), 'help').session.lines)

    expect(drawn.at(-1)).toBe(text(run('help', RESTING).body.at(-1)!))
  })

  it('leaves the arrows to the history once the question is over', () => {
    const asked = running(running(start(), 'help'), 'clear')

    expect(after(asked, { kind: 'earlier' }).buffer).toBe('clear')
  })

  it('keeps the arrows for the person typing while the question is open', () => {
    // An empty prompt belongs to the widget; a prompt with something in it
    // belongs to the person at it. Nothing is recalled here because nothing has
    // been entered, so the terminal comes straight back -- and the menu has not
    // moved either.
    const half = typing(start(), 'hel')

    expect(after(half, { kind: 'earlier' })).toBe(half)
    expect(onCursor(after(half, { kind: 'later' }))).toBe(cursorOn(0))
  })
})

describe('what the menu announces', () => {
  it('says the row the cursor lands on, hint and all', () => {
    const moved = after(start(), { kind: 'later' })

    expect(moved.announcement).toBe(`${MENU_ENTRIES[1]!.label} (${MENU_ENTRIES[1]!.hint})`)
  })

  it('says it again when the cursor comes back round to it', () => {
    // A live region whose text did not change is one an assistive technology is
    // right to stay quiet about, and walking a five-row menu in a circle is the
    // easiest way to land on the same words twice.
    const once = after(start(), { kind: 'later' })
    const round = MENU_ENTRIES.reduce((terminal) => after(terminal, { kind: 'later' }), once)

    expect(round.announcement).toBe(once.announcement)
    expect(round.printed).toBe(once.printed + MENU_ENTRIES.length)
  })

  it('says the exchange when the way out is taken', () => {
    // The way out prints nothing, so without this a screen reader would meet
    // the same silence a dead key gives. What it says is the exchange: the
    // question, and the answer it was given.
    const onQuit = after(start(), { kind: 'earlier' })
    const left = after(onQuit, { kind: 'entered' })

    expect(left.announcement).toBe(`${WHAT_NEXT}
quit`)
    expect(left.printed).toBe(onQuit.printed + 1)
  })
})

describe('clearing a screen with a question on it', () => {
  it('leaves nothing, the frame included', () => {
    expect(running(start(), 'clear').session.lines).toEqual([])
  })

  it('leaves no question the arrows could still move', () => {
    const cleared = running(start(), 'clear')

    expect(after(cleared, { kind: 'later' })).toBe(cleared)
  })
})

describe('the install picker', () => {
  /**
   * Every value the session is currently asking to have copied.
   *
   * The kind is asked rather than assumed, and since #88 the compiler insists:
   * an `Intent` is a clipboard write or a theme, and only one of the two has a
   * value anybody could paste.
   */
  const asked = (terminal: Terminal): readonly string[] =>
    terminal.session.intents.flatMap((intent) => (intent.kind === 'copy' ? [intent.value] : []))

  /** Every control on screen, by what it would put on a clipboard. */
  const controls = (terminal: Terminal): string[] =>
    terminal.session.lines
      .flatMap((line) => (line.kind === 'text' ? line.spans : []))
      .flatMap((span) => (span.copies === undefined ? [] : [span.copies.value]))

  it('opens the widget #86 built, without modifying it', () => {
    const opened = running(free(), 'install')

    expect(rows(opened.session.lines).at(-1)).toBe(BAR_END)
    expect(opened.session.open).toBe(PICKER)
    expect(onCursor(opened)).toBe(
      `${BAR}  ${RADIO_ACTIVE} ${PICKER.options[0]!.label} (${PICKER.options[0]!.hint})`,
    )
  })

  it('copies the row the cursor was standing on', () => {
    expect(asked(entering(running(free(), 'install')))).toEqual([copying('macos').value])
  })

  it('copies the row the arrows walked to', () => {
    const moved = after(running(free(), 'install'), { kind: 'later' })

    expect(asked(entering(moved))).toEqual([copying('linux').value])
  })

  it('copies a row named at the prompt, because that is the same answer', () => {
    expect(asked(running(running(free(), 'install'), 'windows'))).toEqual([
      copying('windows').value,
    ])
  })

  it('runs the same line whether it was chosen or typed', () => {
    const chosen = entering(running(free(), 'install'))
    const typed = running(free(), `install ${PICKER.options[0]!.label}`)

    expect(rows(chosen.session.lines).slice(-3)).toEqual(rows(typed.session.lines).slice(-3))
  })

  it('leaves the command in the scrollback, with a control that copies it again', () => {
    // The criterion, phrased as what stays on screen: the row is still there
    // afterwards and still carries the whole command.
    const copied = running(free(), 'install macos')

    expect(controls(copied)).toContain(commandFor('macos').command)
  })

  it('stops asking for it once the transition that asked is over', () => {
    // What `Session.intents` means, settled here because #91 is the first
    // ticket to put anything in it: an intent lives for exactly the transition
    // that declared it. Carried instead, every later keystroke would re-copy.
    expect(asked(running(running(free(), 'install macos'), 'help'))).toEqual([])
  })
})

describe('a control, used again', () => {
  it('declares the value and prints nothing', () => {
    // *Copied again without re-running anything*, which is why a copy control
    // is not a `runs` span: running the command would reprint the block it is
    // standing in.
    const copied = running(free(), 'install macos')
    const again = after(copied, { kind: 'copied', intent: copying('macos') })

    expect(again.session.lines).toBe(copied.session.lines)
    expect(again.session.intents).toEqual([copying('macos')])
  })

  it('says what it put there, because nothing on screen changed to say it', () => {
    const again = after(start(), { kind: 'copied', intent: copying('macos') })

    expect(again.announcement).toBe('Copied the install command.')
    expect(again.printed).toBe(start().printed + 1)
  })
})

describe('the guess at the visitor\'s system', () => {
  const WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  it('is exactly the session that system would have been served', () => {
    // The whole property, and the reason this is a rebuild rather than a splice
    // into the rows: there is one description of what a page looks like for a
    // given system, and detection produces it rather than editing towards it.
    expect(after(start(), { kind: 'detected', agent: WINDOWS }).session).toEqual(
      finished(CLI_VERSION, 'windows'),
    )
  })

  it('changes nothing at all when it cannot tell', () => {
    const page = start()

    expect(after(page, { kind: 'detected', agent: 'curl/8.4.0' })).toBe(page)
  })

  it('keeps its hands off a page somebody has already used', () => {
    // It arrives from a mount effect, so in practice nothing has happened yet.
    // The guard is what makes that a property rather than an ordering somebody
    // has to keep -- a late guess must not throw away a scrollback.
    const used = running(start(), 'help')

    expect(after(used, { kind: 'detected', agent: WINDOWS })).toBe(used)
  })
})

describe('a second caller, driven by the same reducer', () => {
  /**
   * #91 opens this widget for the install command and may not modify it, and
   * the reducer is half of what it would otherwise have had to modify. So this
   * is a session carrying a question that is not the menu -- three rows, its
   * own message, labels that are not what the rows run -- put through every
   * input the menu uses.
   *
   * The strings are this file's own rather than #91's, for the reason
   * `select.test.ts` gives one seam over: the point is that nothing here knows
   * who is asking.
   */
  const picker: Open = {
    message: 'Which system?',
    options: [
      { label: 'macos', hint: 'the curl line', runs: 'help' },
      { label: 'linux', hint: 'the curl line', runs: 'help' },
      { label: 'windows', hint: 'the powershell line' },
    ],
    cursor: 0,
  }

  const asked = (): Terminal => booted({ lines: asking(picker), intents: [], open: picker })

  it('moves through its own rows, wrapping at its own length', () => {
    const drawn = rows(after(asked(), { kind: 'earlier' }).session.lines)

    expect(drawn).toContain(`${BAR}  ${RADIO_ACTIVE} windows (the powershell line)`)
  })

  it('answers on Enter and runs what the row carries', () => {
    const drawn = rows(after(asked(), { kind: 'entered' }).session.lines)

    expect(drawn).toContain(`${STEP_DONE}  Which system?`)
    expect(drawn.at(-1)).toBe(text(run('help', RESTING).body.at(-1)!))
  })

  it('answers to a row named at the prompt', () => {
    const drawn = rows(running(asked(), 'linux').session.lines)

    expect(drawn).toContain(`${BAR}  linux`)
  })

  it('has its own way out, and it is the row that runs nothing', () => {
    const left = running(asked(), 'windows')

    expect(rows(left.session.lines).at(-1)).toBe(`${BAR}  windows`)
    expect(left.announcement).toBe(`Which system?
windows`)
  })

  it('is left behind by a word it does not carry', () => {
    const drawn = rows(running(asked(), 'help').session.lines)

    expect(drawn).toContain(`${STEP_LEFT}  Which system?`)
    expect(drawn.some((line) => line.includes(LEGEND))).toBe(false)
  })
})

describe('the theme, which this module is told rather than asks', () => {
  const dark = { theme: 'dark', system: 'light' } as const

  it('rests where the served page already is', () => {
    expect(start().preference).toBe(RESTING)
  })

  it('hands back the same terminal when nothing moved', () => {
    // The common case by a distance: the effect that dispatches this is keyed
    // on values the provider republishes, and a visitor who has chosen nothing
    // lands on the value `booted` already set. `components/live.tsx` schedules
    // the boot's next frame from an effect keyed on the whole terminal, so a
    // new object here would clear a frame in flight and re-schedule it.
    const terminal = start()

    expect(after(terminal, { kind: 'preferred', preference: RESTING })).toBe(terminal)
    expect(
      after(terminal, { kind: 'preferred', preference: { theme: 'system', system: 'light' } }),
    ).toBe(terminal)
  })

  it('changes nothing on screen when it does move', () => {
    // A theme is two custom properties swapping places in a stylesheet, not a
    // session redrawn -- which is why this stores an answer where `detected`
    // rebuilds one.
    const terminal = start()
    const told = after(terminal, { kind: 'preferred', preference: dark })

    expect(told.preference).toEqual(dark)
    expect(told.session).toBe(terminal.session)
    expect(told.announcement).toBe(terminal.announcement)
    expect(told.printed).toBe(terminal.printed)
  })

  it('says nothing to a screen reader, because nobody did anything', () => {
    // `printed` is what makes a live region read the same sentence twice, and
    // an operating system moving to dark at sunset is not an event this page
    // should announce. It is also `detected`'s guard for *a page somebody has
    // used*, so bumping it here would cost the visitor the system detection.
    const told = after(start(), { kind: 'preferred', preference: dark })

    expect(after(told, { kind: 'detected', agent: 'Windows' }).session).not.toBe(told.session)
  })

  it('is what a bare theme reports afterwards', () => {
    // The round trip, closed at this seam: the reducer was told, and the
    // command it hands the answer to prints it.
    const told = after(start(), { kind: 'preferred', preference: dark })

    expect(rows(running(told, 'theme').session.lines)).toContain('Dark.')
  })

  it('is not a keystroke, and the keymap does not name it', () => {
    expect(Object.values(KEYS)).not.toContain('preferred')
    expect(Object.values(UNFOCUSED)).not.toContain('preferred')
  })
})
