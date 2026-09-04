import { JSDOM } from 'jsdom'
import { act, type ReactNode } from 'react'

/**
 * A DOM, and the smallest set of helpers that can drive a component in one.
 *
 * Seam two of three. `e2e/harness.ts` is the same idea one seam up and this
 * follows its shape deliberately: plain exported functions rather than a
 * framework's fixtures, and no test id anywhere, because this repo has none.
 *
 * There is no `@testing-library` here and that is a choice rather than an
 * omission. Its value is a query vocabulary for finding things in a page, and
 * this seam is not looking for things -- it knows exactly which element it
 * means, because the component it is testing is thirty lines long. What it
 * needs is a DOM, a renderer and `act`, which is what this file is.
 *
 * **The globals are installed before React is loaded, and that ordering is why
 * `react-dom/client` is imported inside `mounted` rather than at the top.** An
 * `import` statement hoists above the assignments below it, so a static import
 * of the renderer would run while `document` was still undefined.
 */

declare global {
  // `var` rather than `const`, because that is the only declaration form that
  // adds a property to `globalThis`. React reads this to decide whether `act`
  // is allowed to be in charge of flushing.
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://jukebox.dev/',
  pretendToBeVisual: true,
})

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  Element: dom.window.Element,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  MouseEvent: dom.window.MouseEvent,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** Modifiers held down alongside a keystroke. */
export type Held = { readonly shiftKey?: boolean; readonly ctrlKey?: boolean }

export type Mounted = {
  /** Everything the component rendered. */
  readonly container: HTMLElement
  readonly one: (selector: string) => HTMLElement
  readonly all: (selector: string) => HTMLElement[]
  /** The live prompt's field, which most of these assertions are about. */
  readonly field: () => HTMLInputElement
  /** A keystroke, handed back so a test can read whether anything cancelled it. */
  readonly press: (key: string, held?: Held) => Promise<Event>
  readonly type: (value: string) => Promise<void>
  readonly click: (element: HTMLElement) => Promise<void>
  readonly unmount: () => Promise<void>
}

/**
 * Everything below reaches for the **globals**, never back for `dom.window`.
 *
 * The two are the same objects at runtime and different types at compile time:
 * `dom.window.document` is jsdom's own `Document`, while the bare `document` is
 * the one `lib.dom` declares -- and `lib.dom` is what React, the component
 * under test and every other file in this workspace are written against. Mixing
 * them is what forces an `as unknown as` at each call site, and a double
 * assertion is a compiler being told to stop reporting a mismatch that is real.
 *
 * Going through the globals makes the `Object.assign` above the single seam
 * between the two worlds, which is the whole reason it is there. There is no
 * type assertion anywhere in this file, which matches the rest of the
 * workspace: the only `as` under `site/` on `main` is a `catch (cause: unknown)`
 * narrowing in `scripts/`.
 */
export const mounted = async (node: ReactNode): Promise<Mounted> => {
  const { createRoot } = await import('react-dom/client')

  const container = document.createElement('div')
  document.body.append(container)

  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })

  const one = <T extends HTMLElement>(selector: string): T => {
    const found = container.querySelector<T>(selector)
    if (found === null) throw new Error(`nothing matched ${selector}`)
    return found
  }

  const field = (): HTMLInputElement => one<HTMLInputElement>('input')

  return {
    container,
    one: (selector) => one(selector),
    all: (selector) => [...container.querySelectorAll<HTMLElement>(selector)],
    field,

    press: async (key, held = {}) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...held,
      })
      await act(async () => {
        field().dispatchEvent(event)
      })
      return event
    },

    // A controlled input ignores a plain assignment, because React's own value
    // tracker sees no change and never fires `onChange`. Going through the
    // prototype's setter is what a real keystroke does to the element.
    type: async (value) => {
      const element = field()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      await act(async () => {
        setter?.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },

    click: async (element) => {
      await act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    },

    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}
