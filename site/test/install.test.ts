import { describe, expect, it } from 'bun:test'
import { INSTALL_COMMANDS, platforms } from '../lib/content'
import {
  commandFor,
  guessed,
  isSystem,
  offering,
  PICKER,
  SYSTEMS,
  WHICH_SYSTEM,
} from '../lib/session/install'
import { text, type Line, type Span } from '../lib/session/lines'

/**
 * The three systems, the two commands, and the guess that picks one of them.
 *
 * Seam one, so none of this is allowed a browser: `guessed` is handed a user
 * agent as a string and `components/live.tsx` is what reads it off `navigator`.
 * That is `boot.ts`'s arrangement with `REDUCED_MOTION` -- the module owns the
 * question, the component asks it -- and it is what makes the detection
 * answerable under `bun test` at all.
 *
 * The commands are imported rather than typed. `README.md` owns them and
 * `lib/content.ts` lifts them; a test spelling out a 78-character URL would be
 * a third copy free to agree with neither.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

const spans = (line: Line): readonly Span[] => (line.kind === 'text' ? line.spans : [])

describe('the systems the page offers', () => {
  it('names three, and the ticket names the same three', () => {
    // Pinned rather than derived. Three rows is the acceptance criterion, and a
    // list computed from `INSTALL_COMMANDS` would agree with whatever that file
    // happened to say.
    expect(SYSTEMS).toEqual(['macos', 'linux', 'windows'])
  })

  it('resolves two of them to one command', () => {
    // The curl line installs on both, which is why the label reads `macos ·
    // linux` in either case. Three systems, two commands: the picker offers a
    // system and the page prints a command.
    expect(commandFor('macos')).toBe(commandFor('linux'))
    expect(commandFor('windows')).not.toBe(commandFor('macos'))
  })

  it('gives windows the powershell line and its own sigil', () => {
    // Not a footnote. `CLAUDE.md` calls Windows this project's primary
    // environment, and a `$` in front of a PowerShell line would be a small
    // untruth on a page whose whole job is handing over something to paste.
    expect(commandFor('windows').command).toBe(INSTALL_COMMANDS[1]!.command)
    expect(commandFor('windows').prompt).toBe('>')
    expect(commandFor('macos').prompt).toBe('$')
  })

  it('labels a command with every system it covers', () => {
    expect(platforms(commandFor('macos'))).toBe('macos · linux')
    expect(platforms(commandFor('windows'))).toBe('windows')
  })

  it('recognises its own three words and nothing else', () => {
    expect(isSystem('windows')).toBe(true)
    expect(isSystem('bsd')).toBe(false)
    expect(isSystem('')).toBe(false)
  })
})

describe('the picker', () => {
  it('offers one row per system, resting on the first', () => {
    expect(PICKER.message).toBe(WHICH_SYSTEM)
    expect(PICKER.options.map((option) => option.label)).toEqual([...SYSTEMS])
    expect(PICKER.cursor).toBe(0)
  })

  it('runs the command that names the system, not the system', () => {
    // What `Option.runs` is for. The row reads `macos` because that is what a
    // visitor is choosing between; what it enters is a line they could have
    // typed, so a chosen row and a typed one are the same thing.
    expect(PICKER.options.map((option) => option.runs)).toEqual([
      'install macos',
      'install linux',
      'install windows',
    ])
  })

  it('has no way out, because leaving is what any other word does', () => {
    // The menu carries `quit` because the binary's menu does. This one is the
    // page's own, and `terminal.ts` already leaves a select behind on any word
    // that does not name a row -- so a fourth row offering to do that would be
    // a row for something that already works.
    expect(PICKER.options.every((option) => option.runs !== undefined)).toBe(true)
  })
})

describe('the offer', () => {
  it('sets the platforms above the command a visitor would paste', () => {
    expect(rows(offering('windows'))).toEqual([
      '# windows',
      `> ${INSTALL_COMMANDS[1]!.command}   copy`,
    ])
  })

  it('puts the whole command on the clipboard, not the row', () => {
    // `SITE.md` 06's rule, one artifact over: the clipboard carries the full
    // value however the row is drawn. The row here has a sigil in front of it
    // and a control after it, and neither belongs in a shell.
    const control = spans(offering('macos')[1]!).find((span) => span.copies !== undefined)

    expect(control?.copies?.value).toBe(INSTALL_COMMANDS[0]!.command)
    expect(control?.text).toBe('copy')
  })
})

describe('the guess', () => {
  /** Real strings, because a guess held to invented ones is held to nothing. */
  const AGENTS = {
    windows:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    macos:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    chromeos:
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  } as const

  it('reads each of the three off a real user agent', () => {
    expect(guessed(AGENTS.windows)).toBe('windows')
    expect(guessed(AGENTS.macos)).toBe('macos')
    expect(guessed(AGENTS.linux)).toBe('linux')
  })

  it('sends a chromebook to the curl line', () => {
    // Not a system the picker names, and the answer still has to be one of
    // three. `crosh` is a shell and the curl line is the one that runs there.
    expect(guessed(AGENTS.chromeos)).toBe('linux')
  })

  it('answers nothing when it does not know', () => {
    // `undefined` rather than a fallback, so the caller keeps whatever the page
    // was served with instead of this file quietly choosing for it.
    expect(guessed('')).toBeUndefined()
    expect(guessed('curl/8.4.0')).toBeUndefined()
  })
})
