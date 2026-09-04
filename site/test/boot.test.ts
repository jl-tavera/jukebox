import { describe, expect, it } from 'bun:test'
import { CLI_VERSION, WORDMARK } from '../lib/content'
import { BEAT, CAP, keystroke, QUICKEST, replay, ROW, SLOWEST } from '../lib/session/boot'
import { finished, PROMPT, TYPED } from '../lib/session'
import { text, type Line, type Session } from '../lib/session/lines'

/**
 * The boot, replayed -- and every question about it that does not need a
 * browser, which is nearly all of them.
 *
 * Seam one of three. What the component does with a frame is `wiring/`, and
 * that the whole thing actually finishes inside the cap on a real clock is
 * `e2e/boot.spec.ts`. Neither belongs here and this file must not drift into
 * either: the frames are a pure function of the finished session, so what they
 * contain and how long they are held for are both answerable with no DOM and no
 * timer in the room.
 *
 * **Nothing here is written down twice.** The expected rows come from
 * `finished` itself and the art from `WORDMARK`, because the whole claim of
 * `replay` is that it deconstructs the session rather than describing it a
 * second time -- and a test that retyped either could agree with neither.
 */

const session = (): Session => finished(CLI_VERSION)
const frames = () => replay(session())
const rows = (lines: readonly Line[]): string[] => lines.map(text)

/** Where the command the page types sits in the finished session. */
const typedAt = (): number => rows(session().lines).indexOf(`${PROMPT} ${TYPED}`)

/** The wordmark as the header hands it over: the leading blank row is a line of the session. */
const ART = WORDMARK.split('\n').slice(1)

/** Whatever art a frame is drawing, as its rows. */
const drawn = (lines: readonly Line[]): string[][] =>
  lines.flatMap((line) => (line.kind === 'art' ? [line.text.split('\n')] : []))

describe('the replay, end to end', () => {
  it('ends on the session the page was served with', () => {
    // The whole point of deriving the frames from `finished` rather than
    // writing them beside it. **`toBe`, not `toEqual`:** the last frame does not
    // resemble the floor, it *is* the array the page was served with, handed
    // back unchanged. A later ticket growing the session cannot leave the boot
    // stopping short of it, and the renderer is given the identical array it was
    // prerendered with -- the same reasoning `capped()` gives for its own
    // identity return in `terminal.ts`.
    const served = session()

    expect(replay(served).at(-1)!.lines).toBe(served.lines)
  })

  it('opens on the two comments a human wrote, and an empty prompt', () => {
    // The `#` rows are the page's own preamble rather than something the binary
    // printed, so they are never cleared -- the page is never blank and nothing
    // below them jumps when they arrive, because they never arrive.
    const opening = rows(frames()[0]!.lines)
    const served = rows(session().lines)

    expect(opening).toEqual([...served.slice(0, typedAt()), `${PROMPT} `])
  })

  it('types the command one character at a time', () => {
    const typing = frames().slice(0, TYPED.length + 1)

    expect(typing.map((frame) => rows(frame.lines).at(-1))).toEqual(
      Array.from({ length: TYPED.length + 1 }, (_, n) => `${PROMPT} ${TYPED.slice(0, n)}`),
    )
  })

  it('computes the same frames twice', () => {
    // The counterpart to `session.test.ts`'s "computes the same session twice",
    // and what a deterministic jitter buys: no clock, no random, nothing hidden.
    // A module that answered differently on a second call could not be pinned
    // here at all, and the cap below would be a distribution rather than a fact.
    expect(replay(session())).toEqual(replay(session()))
  })
})

describe('every frame', () => {
  it('is a prefix of the finished session, row for row', () => {
    // Nothing ever appears and then goes away. Said as a prefix rather than as
    // a list of frames, because it is the one property that has to hold of all
    // of them -- a half-typed command and a half-arrived wordmark are both just
    // a row that is a prefix of the row it is becoming.
    const served = rows(session().lines)

    for (const [index, frame] of frames().entries()) {
      const shown = rows(frame.lines)

      expect(shown.length, `frame ${index} has more rows than the session`).toBeLessThanOrEqual(
        served.length,
      )

      for (const [at, line] of shown.entries()) {
        expect(
          served[at]!.startsWith(line),
          `frame ${index} row ${at} is not on its way to the session: ${JSON.stringify(line)}`,
        ).toBe(true)
      }
    }
  })

  it('never shows a half-drawn row of the wordmark', () => {
    // #84's second criterion, and the reason the art arrives as rows rather
    // than as characters. Typing 335 Block Elements would be slow and would
    // spend most of that time showing rows that read as noise; a banner
    // scrolling into a real terminal arrives as lines.
    for (const [index, frame] of frames().entries()) {
      for (const art of drawn(frame.lines)) {
        for (const [at, line] of art.entries()) {
          expect(line, `frame ${index} drew row ${at} of the wordmark half-finished`).toBe(ART[at]!)
        }
      }
    }
  })

  it('adds one row of the wordmark at a time', () => {
    // Every height the mark is ever drawn at, with the frames that held it
    // steady collapsed -- once the art is whole it stays whole for the rest of
    // the boot, and repeating five eleven times says nothing. What is left is
    // the growth itself, and it may not skip a row.
    const heights = frames()
      .flatMap((frame) => drawn(frame.lines).map((art) => art.length))
      .filter((height, index, all) => height !== all[index - 1])

    expect(heights).toEqual(Array.from({ length: ART.length }, (_, index) => index + 1))
  })
})

describe('the pacing', () => {
  const spent = (): number => frames().reduce((ms, frame) => ms + frame.hold, 0)

  it('completes inside the cap', () => {
    // The acceptance criterion, and the only number in #84 that is a
    // requirement rather than a target. It lands around 1.6s today.
    expect(spent()).toBeLessThan(CAP)
  })

  it('spends its time typing, waiting for Enter, and scrolling', () => {
    // Derived rather than pinned to a literal. A magic total would fail the day
    // #86 or #88 adds a row to the session, which is a change to the session
    // rather than to the pacing -- while this still fails if time starts going
    // anywhere the three constants do not account for.
    const typed = Array.from({ length: TYPED.length }, (_, at) => keystroke(at))
    const scrolled = frames().length - TYPED.length - 2

    expect(spent()).toBe(typed.reduce((ms, one) => ms + one, 0) + BEAT + scrolled * ROW)
  })

  it('types at somewhere between 60 and 80 milliseconds a character', () => {
    // Uneven, and deliberately not random. A cycle indexed by position reads as
    // a hand at a keyboard and stays a fact this file can pin -- `Math.random`
    // would make the total above a distribution to argue about instead.
    for (const [at, frame] of frames().slice(0, TYPED.length).entries()) {
      expect(frame.hold, `character ${at}`).toBeGreaterThanOrEqual(QUICKEST)
      expect(frame.hold, `character ${at}`).toBeLessThanOrEqual(SLOWEST)
    }
  })

  it('holds a beat after the last character, as if Enter had landed', () => {
    expect(frames()[TYPED.length]!.hold).toBe(BEAT)
  })

  it('scrolls every row after that at one rate', () => {
    for (const frame of frames().slice(TYPED.length + 1, -1)) {
      expect(frame.hold).toBe(ROW)
    }
  })

  it('holds the last frame open, because nothing follows it', () => {
    expect(frames().at(-1)!.hold).toBe(0)
  })
})

describe('a session it cannot replay', () => {
  it('says so rather than typing nothing', () => {
    // A replay that cannot find the command it exists to type is a programming
    // error, and this is where it surfaces -- under `bun test`, rather than as
    // a page that boots to a prompt nobody typed at.
    expect(() => replay({ lines: [], intents: [] })).toThrow()
  })
})
