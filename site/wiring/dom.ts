import { JSDOM } from 'jsdom'
import { act, type ReactNode } from 'react'
import { REDUCED_MOTION } from '@/lib/session/boot'

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

/**
 * What the page is told about motion, and the one dial a test here has to set.
 *
 * **jsdom implements no `matchMedia` at all**, so without this every test that
 * mounts `Live` throws the moment #84's mount effect asks. The stub answers one
 * query and no other: a stub that said `matches` to anything would agree with a
 * component asking the wrong question.
 *
 * **It answers `reduce` until a test says otherwise.** Every case in this
 * directory that is about something else then mounts the finished session with
 * no timer running, exactly as it did before #84 -- while a default of
 * `no-preference` would start a frame chain underneath assertions about a live
 * region and a caret. The boot's own cases ask for motion explicitly and put it
 * back in a `finally`, because this jsdom is one object shared by the file.
 */
let motion: 'reduce' | 'no-preference' = 'reduce'

export const prefers = (preference: typeof motion): void => {
  motion = preference
}

/**
 * The second query this window answers, and the one `next-themes` asks.
 *
 * Spelled here rather than imported, because the module that asks it is a
 * dependency rather than this project's -- and `lib/session/theme.ts`
 * deliberately never names a media query at all, being the half of the theme
 * that has no browser to ask.
 *
 * **It answers `light` until a case says otherwise**, which is `prefers`'
 * arrangement and for its reason: every case in this directory that is about
 * something else should mount the page in one known theme rather than in
 * whichever one a previous case left behind.
 */
export const COLOUR_SCHEME = '(prefers-color-scheme: dark)'

let scheme: 'light' | 'dark' = 'light'

export const schemed = (preference: typeof scheme): void => {
  scheme = preference
}

Object.assign(dom.window, {
  matchMedia: (query: string) => ({
    matches:
      (query === REDUCED_MOTION && motion === 'reduce') ||
      (query === COLOUR_SCHEME && scheme === 'dark'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    // The deprecated pair, and not optional: `next-themes` still calls
    // `addListener` to hear the operating system change its mind, and a stub
    // without it throws the moment a provider mounts.
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

/**
 * The theme, forgotten between cases.
 *
 * `next-themes` writes its choice to `localStorage` and its answer to a class
 * on `<html>`, and this window is one object shared by the file -- so both
 * survive into every case below the one that set them unless a `finally` puts
 * them back. It is `forget`'s arrangement one screen down, for a second piece
 * of state that outlives an unmount.
 */
export const forgetTheme = (): void => {
  dom.window.localStorage.removeItem('theme')
  dom.window.document.documentElement.className = ''
  schemed('light')
}

/**
 * What reached the clipboard, and the only way this seam can see one.
 *
 * jsdom implements no `navigator.clipboard` at all, so without this every test
 * that copies anything throws -- and `SITE.md` 06 asks for exactly this shape
 * anyway: *verify by capturing the argument to `clipboard.writeText`, not by
 * eye*. A stub that records is what makes that sentence checkable with no
 * browser in the room, and #91 is the first ticket that needed it.
 *
 * `forget` rather than a fresh jsdom per case, because this window is one
 * object shared by the file -- the arrangement `prefers` above already has.
 */
const writes: string[] = []

export const written = (): readonly string[] => writes

export const forget = (): void => {
  writes.length = 0
}

/**
 * Where the page scrolled to, and the only way this seam can see it.
 *
 * **jsdom implements no `scrollTo`** -- it answers with a "not implemented"
 * error on the virtual console rather than throwing, so without this every case
 * that runs a command prints noise and asserts nothing. It is `written()`'s
 * arrangement for a second effect the component performs and no other seam can
 * watch: #89 pins the prompt and the chip row to the bottom of the viewport, so
 * what a chip prints lands below the fold unless the page follows it down.
 *
 * jsdom lays nothing out, so the *number* here means nothing and is not
 * asserted. That the component asked at all is the wiring, and is what this
 * records.
 */
const scrolls: number[] = []

export const scrolled = (): readonly number[] => scrolls

export const forgetScrolling = (): void => {
  scrolls.length = 0
}

Object.assign(dom.window, {
  scrollTo: (options?: number | { top?: number }): void => {
    scrolls.push(typeof options === 'object' ? (options?.top ?? 0) : (options ?? 0))
  },
})

Object.assign(dom.window.navigator, {
  clipboard: {
    writeText: (value: string): Promise<void> => {
      writes.push(value)
      return Promise.resolve()
    },
  },
})

/**
 * Who the page thinks it is talking to.
 *
 * **It answers with nothing until a test says otherwise**, and that is the
 * useful default: `guessed` reads an empty agent as *I cannot tell*, so every
 * case in this directory that is about something else mounts the page exactly
 * as it was served, with no line swapped underneath its assertions.
 *
 * Defined rather than assigned, because jsdom puts `userAgent` on the Navigator
 * prototype as a getter and an assignment to one of those is silently dropped.
 */
let agent = ''

export const pretending = (userAgent: string): void => {
  agent = userAgent
}

Object.defineProperty(dom.window.navigator, 'userAgent', {
  get: () => agent,
  configurable: true,
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/**
 * A key pressed with nothing focused, which is where a page that has just
 * loaded starts.
 *
 * Dispatched on `window` rather than on an element, because that is the only
 * place #84's skip can listen: at boot the field has not been touched, so a
 * keystroke reaches `<body>` and never passes through React's root handler at
 * all.
 */
export const pressed = async (key: string): Promise<Event> => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })

  await act(async () => {
    window.dispatchEvent(event)
  })

  // Handed back for the same reason `press` above hands its own back: whether a
  // keystroke was cancelled is only answerable from the event, and #86 has a
  // key out here that must not be -- Tab, which is how focus reaches the page.
  return event
}

/**
 * A tap on the page, with nothing focused.
 *
 * `pressed` above for the other half of #84's skip. A plain `Event` rather than
 * a `PointerEvent`, which jsdom does not implement -- the listener asks only for
 * the type, and inventing a constructor the browser has and this window does not
 * would be testing the stub.
 */
export const tapped = async (): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  })
}

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
