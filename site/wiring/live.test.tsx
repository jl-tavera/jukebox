import { describe, expect, it } from 'bun:test'
import { Live } from '@/components/live'
import { Screen } from '@/components/screen'
import { CLI_VERSION } from '@/lib/content'
import { run } from '@/lib/session/commands'
import { finished } from '@/lib/session'
import { mounted, type Mounted } from './dom'

/**
 * Seam two: what the component does with what the module computed.
 *
 * **Wiring only, and the boundary is worth restating because it is easy to
 * cross.** Whether `help` lists every command, whether Tab completes an
 * unambiguous prefix, what a scrollback cap does -- all of that is behaviour,
 * it is answered in `test/terminal.test.ts` with no DOM in the room, and
 * re-asserting it here would buy nothing and cost a second place to change it.
 * What lives here is the half that only exists once a component is involved: a
 * keystroke that must be cancelled, a caret that must land at the end, focus
 * that must not be lost, a live region that must actually mutate.
 *
 * Anything needing a pixel -- a computed colour, a hit-tested touch target -- is
 * `e2e/` and must not drift here. jsdom lays nothing out.
 */

const live = (): Promise<Mounted> => mounted(<Live initial={finished(CLI_VERSION)} />)

const region = (page: Mounted): HTMLElement => page.one('[role="status"]')

describe('the keys the browser would otherwise take', () => {
  it('cancels the three it handles itself', async () => {
    // Uncancelled, Tab walks focus out of the field and the arrows jump the
    // caret to either end of the line. Neither is visible to any other seam.
    const page = await live()

    for (const key of ['Tab', 'ArrowUp', 'ArrowDown']) {
      expect((await page.press(key)).defaultPrevented, `${key} was not cancelled`).toBe(true)
    }

    await page.unmount()
  })

  it('lets Shift+Tab out, because that is the way back to the words', async () => {
    // Shift+Tab arrives as `Tab`, so the naive handler cancelled it and trapped
    // focus in the field -- there is nothing after the prompt to tab forwards
    // to, which made backwards the only way out and made it a real trap.
    // `e2e/prompt.spec.ts` found it by being unable to reach a word at all.
    const page = await live()

    expect((await page.press('Tab', { shiftKey: true })).defaultPrevented).toBe(false)

    await page.unmount()
  })

  it('leaves every other key to the field', async () => {
    // The reducer owns the terminal and the `<input>` owns text editing --
    // cancelling a letter here would be this component taking over the second.
    const page = await live()

    for (const key of ['a', 'Backspace', 'ArrowLeft', 'End']) {
      expect((await page.press(key)).defaultPrevented, `${key} was cancelled`).toBe(false)
    }

    await page.unmount()
  })
})

describe('the field', () => {
  it('shows what a completion put in the buffer, with the caret after it', async () => {
    // The likeliest bug in this ticket: writing the reducer's buffer back into
    // the element and leaving the caret at nought, so the next character lands
    // in front of the word that was just completed.
    const page = await live()

    await page.type('co')
    await page.press('Tab')

    expect(page.field().value).toBe('config')
    expect(page.field().selectionStart).toBe('config'.length)

    await page.unmount()
  })

  it('empties when a command is entered', async () => {
    const page = await live()

    await page.type('help')
    await page.press('Enter')

    expect(page.field().value).toBe('')

    await page.unmount()
  })

  it('shows what was recalled', async () => {
    const page = await live()

    await page.type('help')
    await page.press('Enter')
    await page.press('ArrowUp')

    expect(page.field().value).toBe('help')

    await page.unmount()
  })
})

describe('a word that was clicked', () => {
  it('runs, and hands focus back to the prompt', async () => {
    // `clear` is the case that makes this matter rather than a nicety: it
    // deletes the element the cursor was standing on, and focus would fall to
    // `<body>` and leave a keyboard user nowhere.
    const page = await live()

    await page.type('help')
    await page.press('Enter')

    const clear = page.all('.u-word').find((word) => word.textContent === 'clear')!
    await page.click(clear)

    expect(page.all('.u-row')).toHaveLength(0)
    expect(document.activeElement).toBe(page.field())

    await page.unmount()
  })
})

describe('the live region', () => {
  it('carries the last output and none of the scrollback', async () => {
    const page = await live()

    await page.type('add')
    await page.press('Enter')

    expect(region(page).textContent).toBe('Track a playlist.')
    expect(region(page).textContent).not.toContain(`jukebox ${CLI_VERSION}`)

    await page.unmount()
  })

  it('says nothing when nothing has been run', async () => {
    const page = await live()

    expect(region(page).textContent).toBe('')

    await page.unmount()
  })

  it('is untouched by a keystroke', async () => {
    const page = await live()

    await page.type('add')
    await page.press('Enter')
    const before = region(page).textContent

    await page.type('li')
    await page.press('Tab')

    expect(region(page).textContent).toBe(before)

    await page.unmount()
  })

  it('replaces its child when the same answer is printed again', async () => {
    // Identical text is no mutation, and an assistive technology is right to
    // stay quiet about a region that did not change. Replacing the node is what
    // makes the second `help` audible.
    const page = await live()

    await page.type('add')
    await page.press('Enter')
    const first = region(page).firstElementChild

    await page.type('add')
    await page.press('Enter')

    expect(region(page).textContent).toBe('Track a playlist.')
    expect(region(page).firstElementChild).not.toBe(first)

    await page.unmount()
  })
})

describe('the renderer on its own', () => {
  it('draws a landable word as a plain span when there is nowhere to click to', async () => {
    // The property that keeps a session renderable outside a browser: handed no
    // `onRun`, this file produces the markup it produced before #85.
    const page = await mounted(<Screen session={{ lines: run('help').body, intents: [] }} />)

    expect(page.all('button')).toHaveLength(0)
    expect(page.all('.u-word')).toHaveLength(0)
    expect(page.container.textContent).toContain('Track a playlist.')

    await page.unmount()
  })

  it('draws one element per line of the session', async () => {
    const session = finished(CLI_VERSION)
    const page = await mounted(<Screen session={session} />)

    expect(page.all('.u-row, .u-art')).toHaveLength(session.lines.length)

    await page.unmount()
  })
})
