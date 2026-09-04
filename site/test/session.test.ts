import { describe, expect, it } from 'bun:test'
import { CLI_VERSION, hero, MENU_ENTRIES, platforms, WHAT_NEXT, type System } from '../lib/content'
import { versionLine } from '../lib/session/header'
import { commandFor } from '../lib/session/install'
import { text, type Line } from '../lib/session/lines'
import { BAR, BAR_END, STEP } from '../lib/session/select'
import { COMMENT, finished, PROMPT, TYPED } from '../lib/session'

/**
 * The whole session, as a visitor with no JavaScript meets it.
 *
 * This is the seam #82 exists to build and the one #84, #85 and #86 grow: a
 * pure function of a version, returning what the page says and what -- if
 * anything -- it needs done. Everything about behaviour belongs here rather
 * than in a browser, which is the split ADR-0010 borrows from the CLI, where
 * every command returns one result object and `render.ts` is the only thing
 * that writes.
 *
 * The copy is imported rather than typed. `README.md` owns the tagline and the
 * lede and `lib/content.ts` lifts them verbatim; a test quoting them again
 * would be a third copy, free to agree with neither.
 */

const rows = (lines: readonly Line[]): string[] => lines.map(text)

const session = () => finished(CLI_VERSION)

describe('what a human wrote', () => {
  it('sets the tagline and the lede as shell comments', () => {
    const drawn = rows(session().lines)

    // `#` is the vernacular for *a human wrote this*, which is what both of
    // these are. They are comments rather than output because the binary's
    // header has no description line to put the lede in -- see `header.ts`.
    expect(drawn[0]).toBe(`${COMMENT} ${hero.tagline}`)
    expect(drawn[1]).toBe(`${COMMENT} ${hero.lede}`)
  })

  it('puts the lede above the boot rather than inside it', () => {
    // The point of #82's second criterion, phrased as something a reader can
    // see. A faithful boot has nowhere for the lede to go, so it sits above.
    const drawn = rows(session().lines)

    expect(drawn.indexOf(`${COMMENT} ${hero.lede}`)).toBeLessThan(
      drawn.indexOf(`${PROMPT} ${TYPED}`),
    )
  })
})

describe('the command the page exists to hand over', () => {
  /** The offer's second row, as the terminal prints it. */
  const offered = (system: System): string =>
    `${commandFor(system).prompt} ${commandFor(system).command}   copy`

  it('offers one, with a control, and asks for no clipboard nobody reached for', () => {
    // `SITE.md` 01's first job, and the guarantee ADR-0010 traded away when the
    // page became a terminal: a visitor who reads one screen leaves with the
    // command. The offer is an offer -- the page hands it over and does not
    // touch a clipboard to do it.
    expect(rows(session().lines)).toContain(offered('macos'))
    expect(session().intents).toEqual([])
  })

  it('says who the line is for, above it', () => {
    expect(rows(session().lines)).toContain(`${COMMENT} ${platforms(commandFor('macos'))}`)
  })

  it('leads with the curl line, which is the one README leads with', () => {
    expect(rows(session().lines)).not.toContain(offered('windows'))
  })

  it('hands a windows visitor the powershell line, under its own sigil', () => {
    const drawn = rows(finished(CLI_VERSION, 'windows').lines)

    expect(drawn).toContain(offered('windows'))
    expect(drawn).not.toContain(offered('macos'))
  })

  it('says where the other systems are, for a guess that went wrong', () => {
    expect(rows(session().lines)).toContain(`${COMMENT} Run \`install\` to choose another system.`)
  })

  it('puts all of it above the boot, so it is there before a character is typed', () => {
    // `boot.ts` replays from the `$ jukebox` line downwards, so everything above
    // it is in the first frame. Below the boot it would arrive a second and a
    // half late -- and could not go there at all, because the open frame has to
    // be the tail of the session.
    const drawn = rows(session().lines)

    expect(drawn.indexOf(offered('macos'))).toBeLessThan(drawn.indexOf(`${PROMPT} ${TYPED}`))
  })
})

describe('the boot', () => {
  it('types the command at a prompt', () => {
    expect(rows(session().lines)).toContain(`${PROMPT} ${TYPED}`)
  })

  it('says the version the binary says', () => {
    expect(rows(session().lines)).toContain(versionLine(CLI_VERSION))
  })

  it('opens the menu one blank row after the version line', () => {
    // `cli/src/pinned.ts` writes the header followed by two newlines, so a
    // terminal shows exactly one empty row between the version line and the
    // rail. One, not two: the CLI never double-spaces.
    const lines = session().lines
    const at = rows(lines).indexOf(versionLine(CLI_VERSION))

    expect(lines[at + 1]).toEqual({ kind: 'blank' })
    expect(text(lines[at + 2]!)).toBe(BAR)
    expect(text(lines[at + 3]!)).toBe(`${STEP}  ${WHAT_NEXT}`)
  })

  it('ends on the menu, with nothing after it', () => {
    // The page is the session and stops. Anything printed below the frame would
    // be the site talking over the binary it is quoting.
    expect(rows(session().lines).at(-1)).toBe(BAR_END)
  })
})

describe('the grid', () => {
  it('never leaves a gap of two lines', () => {
    // #82: every vertical gap is zero or one line. A blank is the only vertical
    // spacing this page has -- there is no margin anywhere to disagree with
    // this -- so the rule is a property of the list and a test can read it.
    const lines = session().lines
    const doubled = lines.some(
      (line, index) => line.kind === 'blank' && lines[index + 1]?.kind === 'blank',
    )

    expect(doubled).toBe(false)
  })

  it('offsets only by whole characters', () => {
    // Every horizontal offset on this page is a space inside a row, which is
    // all a terminal has. A tab would be an offset of no fixed width, and an
    // indent expressed anywhere but in the string would be one this test could
    // not see at all -- which is why `Line` has no indent field.
    expect(rows(session().lines).every((line) => !line.includes('\t'))).toBe(true)
  })

  it('starts every menu row at the rail', () => {
    const drawn = rows(session().lines)
    const rail = drawn.slice(drawn.indexOf(BAR) + 1).filter((line) => line.startsWith(BAR))

    // The five entries and the legend. The question and the closing corner
    // carry their own glyphs, so they are counted out rather than in.
    expect(rail).toHaveLength(MENU_ENTRIES.length + 1)
  })
})

describe('what the page must do', () => {
  it('asks for nothing to be done', () => {
    // #82 delivers the finished session as static content, so there is no
    // clipboard write, no focus move and no timer to declare. The array is the
    // seam rather than a promise in a comment: #88 and #91 fill it, and #84
    // must keep this true, because it says the served HTML is unchanged.
    expect(session().intents).toEqual([])
  })

  it('computes the same session twice', () => {
    // Cheap, and it catches a clock, a random or hidden state getting in. A
    // module that answered differently on a second call could not be a static
    // export's floor.
    expect(finished('0.1.0')).toEqual(finished('0.1.0'))
  })
})
