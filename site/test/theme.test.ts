import { describe, expect, it } from 'bun:test'
import { text, type Line, type Span } from '../lib/session/lines'
import { naming, reporting, RESTING, THEMES } from '../lib/session/theme'

/**
 * The theme, as a verb rather than as a control in a corner.
 *
 * Seam one, so nothing here touches a browser. `next-themes` owns the theme
 * and this module may not: what it does instead is *declare* the switch as an
 * intent and let `components/live.tsx` perform it, which is the arrangement
 * `install.ts` already has with a clipboard and `boot.ts` with a media query.
 * The state coming back the other way arrives as a `Preference` -- so what the
 * page says it is set to is answerable under `bun test`, with no provider and
 * no `localStorage` in the room.
 */

describe('what the page says it is set to', () => {
  it('names the scheme, when a visitor chose one', () => {
    expect(text(reporting({ theme: 'light', system: 'dark' }))).toBe('Light.')
    expect(text(reporting({ theme: 'dark', system: 'light' }))).toBe('Dark.')
  })

  it('names what the system resolved to, when the system is being followed', () => {
    // The one case where the choice does not tell a visitor what they are
    // looking at, so it is the one case that says what they are looking at.
    expect(text(reporting({ theme: 'system', system: 'dark' }))).toBe(
      'Following your system, which is dark.',
    )
    expect(text(reporting({ theme: 'system', system: 'light' }))).toBe(
      'Following your system, which is light.',
    )
  })
})

describe('the three, named', () => {
  const spans = (line: Line): readonly Span[] => (line.kind === 'text' ? line.spans : [])

  const landable = (line: Line): Span | undefined =>
    spans(line).find((span) => span.runs !== undefined)

  it('offers exactly light, dark and system, and nothing named after a colour scheme', () => {
    // ADR-0010 puts named schemes out of scope by name: no `theme nord`, and
    // no accent token to build one out of.
    expect(THEMES).toEqual(['light', 'dark', 'system'])
  })

  it('lists all three with a hint apiece', () => {
    expect(naming().map(text)).toEqual([
      '  theme light    Always light',
      '  theme dark     Always dark',
      '  theme system   Follow your system',
    ])
  })

  it('makes each row a word that runs exactly what it reads', () => {
    // `word` has no second argument since #91, and this is why it does not
    // need one back: the visible command and the command it enters are one
    // string, so a row cannot come to promise something it does not do.
    for (const line of naming()) {
      const span = landable(line)
      expect(span?.runs, text(line)).toBe(span?.text ?? '')
    }

    expect(naming().map((line) => landable(line)?.runs)).toEqual([
      'theme light',
      'theme dark',
      'theme system',
    ])
  })

  it('rests where the served page already is', () => {
    // Not a guess standing in for an answer: `system` is `ThemeProvider`'s own
    // default and `light` is what `:root` paints with no class on it.
    expect(RESTING).toEqual({ theme: 'system', system: 'light' })
  })
})
