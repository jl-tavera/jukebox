import {
  dim,
  GUTTER,
  INDENT,
  ink,
  row,
  word,
  type Choosing,
  type Line,
  type Scheme,
  type Theme,
} from './lines'

/**
 * The theme, as a verb with no visible control.
 *
 * `SITE.md` 02 called the corner toggle *"the single piece of chrome"* and gave
 * the reason: both themes are first-class, and a visitor with no control could
 * only ever see whichever one their operating system picked. ADR-0010 deleted
 * the toggle and put the same three answers at the prompt instead -- so the
 * reason has to be answered again, and the `theme` chip #89 draws is what
 * answers it. **A command nobody can see is not a control**, which is why that
 * chip row is load-bearing rather than decoration.
 *
 * **Nothing in this file touches a browser.** `next-themes` owns the theme,
 * the class on `<html>` and the `localStorage` key behind it; this module
 * declares a switch as an intent and `components/live.tsx` performs it. That
 * is `install.ts`'s arrangement with a clipboard and `boot.ts`'s with a media
 * query, and it is what keeps `theme` answerable under `bun test`.
 */

/** The page's own verb for all of this. `commands.ts` registers it under this name. */
export const THEME = 'theme'

/**
 * What the page is set to, and what the visitor's system says underneath it.
 *
 * Two facts rather than one, because `system` is the absence of a choice and
 * so does not say what is on the screen. `system` here is the operating
 * system's own preference -- `next-themes`' `systemTheme` rather than its
 * `resolvedTheme` -- and the difference is what lets a switch be reported
 * before the provider has answered: choosing `light` does not change what the
 * machine underneath prefers, so the second half of a report survives the
 * first half changing.
 */
export type Preference = { readonly theme: Theme; readonly system: Scheme }

/**
 * Where the page stands before anything has told it otherwise.
 *
 * `system` is `ThemeProvider`'s own `defaultTheme`, and `light` is what
 * `:root` paints with no `dark` class on it -- which is exactly what a page
 * whose JavaScript never ran is. So this is not a guess standing in for an
 * answer: it is the served page, described. `booted` starts here and
 * `components/live.tsx` replaces it as soon as the provider has mounted.
 */
export const RESTING: Preference = { theme: 'system', system: 'light' }

/**
 * The three, in the order they are offered.
 *
 * The two schemes and then the way back to the system, which is deliberately
 * last rather than first: it is where a visitor already is, so it reads as the
 * way out of a choice rather than as one more thing to pick.
 */
export const THEMES: readonly Theme[] = ['light', 'dark', 'system']

/**
 * Whether a word names one of them.
 *
 * Takes `string | undefined` so that `components/live.tsx` can narrow what
 * `useTheme` hands back -- which is `undefined` until the provider has mounted
 * -- without a type assertion. This workspace has none outside a
 * `catch (cause: unknown)` narrowing in `scripts/`, and a predicate is the
 * honest way to narrow a string somebody else chose.
 */
export const isTheme = (word: string | undefined): word is Theme =>
  THEMES.some((theme) => theme === word)

export const isScheme = (word: string | undefined): word is Scheme =>
  word === 'light' || word === 'dark'

/** What has to happen off the page, which is everything this file cannot do. */
export const choosing = (theme: Theme): Choosing => ({ kind: 'theme', theme })

/**
 * What each one says about itself. Sentence case and no full stop, which is
 * this page's register for a hint.
 */
const HINTS: Readonly<Record<Theme, string>> = {
  light: 'Always light',
  dark: 'Always dark',
  system: 'Follow your system',
}

/**
 * Where the page stands, said in one sentence.
 *
 * **One function, used by the bare report and by the confirmation after a
 * switch**, so the two cannot come to disagree about how the same state is
 * described. Prose, and set in the human's face: this is the page saying what
 * it just did, not a quotation of anything the binary prints.
 *
 * Following the system is the only state that names a second thing, because it
 * is the only one where the answer does not say what is on the screen.
 */
export const reporting = (preference: Preference): Line =>
  row(
    ink(
      preference.theme === 'system'
        ? `Following your system, which is ${preference.system}.`
        : `${preference.theme === 'light' ? 'Light' : 'Dark'}.`,
    ),
  )

/**
 * The three, named, each one a word the cursor can land on.
 *
 * **The left column reads the whole command and runs the whole command**,
 * which is what lets these be landable at all: `word` runs what it reads and
 * has no second argument, a decision #91 took deliberately when the two
 * candidates for one turned out not to need it. A row reading `light` and
 * running `theme light` would have brought that argument back for a third
 * time; a row reading `theme light` needs nothing.
 *
 * The summaries are `dim` because that is what a second column is, which is
 * what `commands.ts` already draws `help`'s listing as -- so the two tables on
 * this page are one table twice.
 */
export const naming = (): Line[] => {
  const width = Math.max(...THEMES.map((theme) => `${THEME} ${theme}`.length))

  return THEMES.map((theme) => {
    const command = `${THEME} ${theme}`

    return row(
      dim(INDENT),
      word(command),
      dim(' '.repeat(width - command.length) + GUTTER),
      dim(HINTS[theme]),
    )
  })
}
