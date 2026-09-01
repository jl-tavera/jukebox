import { describe, expect, it } from 'bun:test'
import { DELAY_MS, ERASED, FRAMES, spinning } from '../src/spinner'

/**
 * The spinner, tested directly the way `header.test.ts` tests the other piece
 * of chrome and for the same reason: it is handed where to write and whether to
 * animate rather than asking, so both branches are a call away, and reaching
 * either through a menu would mean scripting a keyboard to assert something no
 * keystroke affects.
 *
 * What is asserted is what a person watching the stream would see -- that
 * something appeared at once, that it moved, and that it left nothing behind.
 * Never which frame was drawn when, which is the part most likely to change and
 * least likely to matter.
 */

/** Everything written, in order, with the writes kept apart. */
const recorder = (): { writes: string[]; write: (text: string) => void } => {
  const writes: string[] = []
  return { writes, write: (text) => void writes.push(text) }
}

/** Long enough for the interval to have fired more than once. */
const SEVERAL_FRAMES = DELAY_MS * 3

describe('a spinner on a terminal', () => {
  it('draws a frame before it returns', () => {
    const { writes, write } = recorder()

    const stop = spinning('Working', write, true)

    // Synchronously, and this is the assertion that says so: nothing has been
    // awaited between the call and here. A command that answered inside one
    // interval would otherwise show nothing at all, and "fast" and "never
    // started" are not two things to leave a reader to tell apart.
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('Working')
    expect(FRAMES.some((frame) => writes[0]!.includes(frame))).toBe(true)

    stop()
  })

  it('keeps drawing while it runs, and moves while it does', async () => {
    const { writes, write } = recorder()

    const stop = spinning('Working', write, true)
    await Bun.sleep(SEVERAL_FRAMES)
    stop()

    // The whole of what a spinner is for. A single frame redrawn forever looks
    // exactly like the hang it exists to rule out.
    const drawn = writes.filter((text) => text.includes('Working'))
    expect(drawn.length).toBeGreaterThan(1)
    expect(new Set(drawn).size).toBeGreaterThan(1)
  })

  it('leaves the line empty and stops writing', async () => {
    const { writes, write } = recorder()

    const stop = spinning('Working', write, true)
    stop()

    // The last thing written puts the cursor back at column 0 with nothing on
    // the row, which is what lets `render` start its answer on a clean line.
    expect(writes.at(-1)).toBe(ERASED)

    const written = writes.length
    await Bun.sleep(SEVERAL_FRAMES)

    // The interval is cleared rather than merely ignored. A timer still firing
    // is an event loop still alive, which is the same thing `menu.ts` pauses
    // the keyboard to avoid.
    expect(writes).toHaveLength(written)
  })

  it('can be stopped twice', () => {
    const { writes, write } = recorder()

    const stop = spinning('Working', write, true)
    stop()
    const written = writes.length
    stop()

    // Two things call it: the moment the answer is computed, and the `finally`
    // covering a launch that never reached that moment. A second erase would
    // land after whatever had already been rendered.
    expect(writes).toHaveLength(written)
  })
})

describe('a spinner with no terminal to draw on', () => {
  it('says the message once, and moves nothing', async () => {
    const { writes, write } = recorder()

    const stop = spinning('Working', write, false)
    await Bun.sleep(SEVERAL_FRAMES)
    stop()

    expect(writes).toEqual(['Working\n'])
  })

  it('writes no escape sequence at all', () => {
    const { writes, write } = recorder()

    spinning('Working', write, false)()

    // `jukebox 2>log.txt` at a terminal is the case. One assertion rather than
    // one per escape: anything that starts a sequence fails this.
    expect(writes.join('')).not.toContain('\x1b')
    expect(writes.join('')).not.toContain('\r')
  })
})
