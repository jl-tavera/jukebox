import { describe, expect, it } from 'bun:test'
import { Writable } from 'node:stream'
import { select, text } from '@clack/prompts'
import { DOWN, ENTER, keyboard } from './harness'

/**
 * The scripted keyboard, proven against a real prompt rather than a fake one.
 *
 * `Io` grew an input stream so that the menu #50 describes can be driven at
 * Seam 3 like everything else, and this is the file that keeps the stream
 * honest: the prompt library is imported and run for real, so a change in what
 * it expects of its input surfaces here rather than in the first ticket that
 * tries to build a menu on top of it.
 *
 * The library is still driven directly rather than through `jukebox`, and the
 * reason has changed rather than gone. It used to be that nothing in production
 * prompted at all; #54 built the menu, so `promptsAllowed` has a caller and
 * `menu.test.ts` drives one end to end. What is left here is narrower and worth
 * keeping apart from it: this file asserts what the *stream* is, one library
 * call at a time. An arrow key that stopped arriving whole fails here in a line
 * that names it, instead of as a menu that quietly answered the wrong entry.
 *
 * The stream under test is the harness's own, the same one `Options.keys` hands
 * to a run.
 */

/**
 * Swallows the prompt's own drawing.
 *
 * Not optional: omitting `output` leaves the library writing to the real stdout,
 * which puts cursor moves and redraws through the test runner's own output.
 */
const sink = (): Writable =>
  new Writable({
    write(_chunk, _encoding, done) {
      done()
    },
  })

describe('a scripted keyboard', () => {
  it('answers a select with the option the arrow keys landed on', async () => {
    const answer = await select({
      message: 'What next?',
      options: [
        { value: 'add', label: 'add' },
        { value: 'sync', label: 'sync' },
        { value: 'list', label: 'list' },
      ],
      input: keyboard([DOWN, ENTER]),
      output: sink(),
    })

    // One press down from the first option. The whole point of the arrow: a
    // stream that only delivered characters would answer `add` here, and a menu
    // nobody can move around in is not a menu.
    expect(answer).toBe('sync')
  })

  it('answers a text prompt with what was typed into it', async () => {
    const answer = await text({
      message: 'Which Playlist?',
      input: keyboard([...'jukebox', ENTER]),
      output: sink(),
    })

    expect(answer).toBe('jukebox')
  })

  it('says it is a terminal, and is put into raw mode and taken back out', async () => {
    const input = keyboard([ENTER])

    // The claim the library guards its raw-mode call with. `keyboard` carries
    // why it has to be made; pinned here because a stream that quietly stopped
    // making it would still pass everything below.
    expect(input.isTTY).toBe(true)

    const modes: boolean[] = []
    input.setRawMode = (raw) => void modes.push(raw)

    await select({
      message: 'What next?',
      options: [{ value: 'add', label: 'add' }],
      input,
      output: sink(),
    })

    expect(modes).toContain(true)

    // Handed back at the end, which is the half that matters to whoever owns
    // the terminal next. Asserted as the last thing that happened rather than
    // as a sequence: readline and the library each toggle it on the way
    // through, and how many times is their business rather than ours.
    expect(modes.at(-1)).toBe(false)
  })
})
