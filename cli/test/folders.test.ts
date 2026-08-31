import { describe, expect, it } from 'bun:test'
import { folderFor, sanitized, unclaimed } from '../src/folders'

/**
 * Seam 4: the folder-name sanitizer, called directly.
 *
 * The one discretionary seam in spec #29, and it earns its place on the grounds
 * the pure seams above it earned theirs: the cases are combinatorial, and the
 * failure would otherwise be reported several layers from its cause -- as a
 * write that threw, on a machine whose filesystem happened to be the one that
 * minds.
 *
 * ADR-0004 names the categories and not the mechanics, so what is asserted here
 * is the decision as well as the code: forbidden characters are dropped rather
 * than replaced, and a collision takes ` (2)`, which is the suffix Windows
 * itself reaches for.
 *
 * Nothing here touches a filesystem. The point of a folder name is that it is
 * computed and stored long before anything is created under it -- Fetching does
 * not exist, and ADR-0004's own note is that this decision reaches the code as a
 * string and nothing else.
 */

/** The id a Playlist with no usable title falls back to. */
const ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

describe('the characters a filesystem forbids', () => {
  it('drops every one Windows reserves, and closes the gap behind it', () => {
    // Dropped rather than replaced: a title arrives as prose, and prose with a
    // slash in it reads as two words with a mark between them rather than as
    // three tokens. `_` in place of each would be a name nobody wrote.
    expect(sanitized('Rain / Shine', ID)).toBe('Rain Shine')
    expect(sanitized('AC:DC', ID)).toBe('ACDC')
    expect(sanitized('what<is>this"one"|called?*', ID)).toBe('whatisthisonecalled')
    expect(sanitized('back\\slash', ID)).toBe('backslash')
  })

  it('drops control characters, which no filesystem will take either', () => {
    expect(sanitized('Deep\x00Focus', ID)).toBe('DeepFocus')
    expect(sanitized('bell\x07 and unit\x1f', ID)).toBe('bell and unit')

    // The whitespace ones are whitespace first and control characters second,
    // so they collapse into a space rather than vanishing and welding two
    // words into one nobody wrote.
    expect(sanitized('Line\nBreak\tTab', ID)).toBe('Line Break Tab')
  })

  it('leaves everything else alone, including what merely looks risky', () => {
    // A name is the user's, and the only reason to touch a character is that
    // something will refuse it. Punctuation, accents and emoji are all legal
    // path characters on every platform Jukebox ships to.
    expect(sanitized("Café — Sunday's Best (2019) [remaster] 🎧", ID)).toBe(
      "Café — Sunday's Best (2019) [remaster] 🎧",
    )
  })
})

describe('a name a filesystem will take but not keep', () => {
  it('loses its trailing dots and spaces', () => {
    // Windows silently strips both when it creates a directory, so a name kept
    // with them is a name the Mirror and the disk disagree about -- and the
    // Mirror is what a later Fetch would look the folder up by.
    expect(sanitized('Focus.', ID)).toBe('Focus')
    expect(sanitized('Focus   ', ID)).toBe('Focus')
    expect(sanitized('Focus. . .', ID)).toBe('Focus')
  })

  it('loses its leading whitespace too, and collapses the rest', () => {
    expect(sanitized('   Slow    Mornings   ', ID)).toBe('Slow Mornings')
  })
})

describe('a name that is a device', () => {
  it('is moved off the reserved word rather than away from the title', () => {
    // `CON` is not a name Windows will give a directory at all. Suffixing keeps
    // the title legible, which dropping it or replacing it with the id would
    // not: someone whose Playlist is called CON should still find it.
    expect(sanitized('CON', ID)).toBe('CON (device)')
    expect(sanitized('nul', ID)).toBe('nul (device)')
    expect(sanitized('LPT9', ID)).toBe('LPT9 (device)')
    expect(sanitized('COM1', ID)).toBe('COM1 (device)')
  })

  it('is still a device when it carries an extension', () => {
    // `CON.txt` is reserved as surely as `CON` is -- the reservation is on the
    // stem, and a name that looks like a filename is the form of it that is
    // easiest to miss.
    expect(sanitized('CON.txt', ID)).toBe('CON.txt (device)')
    expect(sanitized('aux.mp3', ID)).toBe('aux.mp3 (device)')
  })

  it('is not a device merely for starting with one', () => {
    expect(sanitized('CONCERT', ID)).toBe('CONCERT')
    expect(sanitized('Consolation', ID)).toBe('Consolation')
    expect(sanitized('COM10', ID)).toBe('COM10')
  })
})

describe('a name longer than a path segment should be', () => {
  it('is cut at a word rather than mid-word', () => {
    const long = 'Songs for a very long drive '.repeat(10).trim()
    const cut = sanitized(long, ID)

    expect(cut.length).toBeLessThanOrEqual(100)

    // 100 rather than the filesystem's 255 because ADR-0004 puts a track file
    // inside this folder inside a Library root the user chose, and the whole
    // path is what has a limit.
    expect(long.startsWith(cut)).toBe(true)

    // The cut landed on a word boundary, so it reads as an abbreviation
    // rather than as corruption. Asserted against the original rather than
    // against a counted offset, which would be this test doing the same
    // arithmetic as the code and agreeing with itself.
    expect(long.charAt(cut.length)).toBe(' ')
  })

  it('is cut hard when there is no word to cut at', () => {
    const unbroken = 'x'.repeat(200)
    expect(sanitized(unbroken, ID)).toBe('x'.repeat(100))
  })

  it('does not keep a space the cut exposed', () => {
    const long = `${'a'.repeat(95)} bbbbbbbbbb`
    expect(sanitized(long, ID)).toBe('a'.repeat(95))
  })
})

describe('a name that is both a device and too long', () => {
  it('is capped as well as suffixed', () => {
    // The two rules crossed, which is where the cap first leaked: a reserved
    // *stem* is four characters, but a reserved *name* is any length, because the
    // reservation covers an extension too. `CON.` and two hundred more used to
    // come back at its full length with ` (device)` on the end.
    const long = `CON.${'a'.repeat(200)}`
    const cut = sanitized(long, ID)

    expect(cut.endsWith(' (device)')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(100 + ' (device)'.length)
  })

  it('holds its ceiling whatever it is handed', () => {
    // One assertion over every shape above, because the cap is the property a
    // filesystem actually enforces and the ways to slip past it are exactly the
    // early returns.
    const ceiling = 100 + ' (device)'.length

    for (const title of [
      `CON.${'a'.repeat(300)}`,
      `LPT9 ${'word '.repeat(60)}`,
      `${'/'.repeat(50)}${'b'.repeat(300)}`,
      'c'.repeat(1000),
      `${'d'.repeat(99)} ${'e'.repeat(99)}`,
    ]) {
      expect(sanitized(title, ID).length).toBeLessThanOrEqual(ceiling)
    }
  })
})

describe('a name with nothing left of it', () => {
  it('falls back to the id the Playlist is tracked under', () => {
    // The same fallback the CLI uses when it displays a Playlist the Source
    // offered no usable name for. `CONTEXT.md` forbids inventing a placeholder,
    // and the id is the one string that is always there and always this
    // Playlist's.
    expect(sanitized('', ID)).toBe('spotify-3cEYpjA9oz9GiPac4AsH4n')
    expect(sanitized(null, ID)).toBe('spotify-3cEYpjA9oz9GiPac4AsH4n')
    expect(sanitized('///', ID)).toBe('spotify-3cEYpjA9oz9GiPac4AsH4n')
    expect(sanitized('   ...   ', ID)).toBe('spotify-3cEYpjA9oz9GiPac4AsH4n')
  })

  it('spells the id without the colon it is joined by', () => {
    // ADR-0001 joins a Source and its id with a colon, and a colon is the one
    // forbidden character an id is guaranteed to contain.
    expect(sanitized(null, ID)).not.toContain(':')
  })
})

describe('two Playlists whose titles sanitize alike', () => {
  it('are told apart by a numeric suffix', () => {
    const taken = new Set(['Rain Shine'])

    expect(unclaimed('Rain Shine', (name) => taken.has(name))).toBe('Rain Shine (2)')

    taken.add('Rain Shine (2)')
    expect(unclaimed('Rain Shine', (name) => taken.has(name))).toBe('Rain Shine (3)')
  })

  it('collide only after sanitization, not before', () => {
    // `Rain / Shine` and `Rain Shine` are two different Playlists with one
    // folder name between them, and the collision is invisible in the titles.
    const taken = new Set<string>()
    const claim = (title: string) => {
      const name = folderFor(title, ID, (candidate) => taken.has(candidate))
      taken.add(name)
      return name
    }

    expect(claim('Rain / Shine')).toBe('Rain Shine')
    expect(claim('Rain Shine')).toBe('Rain Shine (2)')
    expect(claim('Rain: Shine')).toBe('Rain Shine (3)')
  })

  it('leave the first name alone', () => {
    // The Playlist that got there first keeps what it was created with. ADR-0004
    // is explicit that a folder is never renamed, and a suffix that moved onto
    // the earlier one would be exactly that.
    const taken = new Set<string>()
    const first = folderFor('Rain Shine', ID, (name) => taken.has(name))
    taken.add(first)
    folderFor('Rain / Shine', ID, (name) => taken.has(name))

    expect(first).toBe('Rain Shine')
  })

  it('is not a collision when nothing holds the name', () => {
    expect(unclaimed('Rain Shine', () => false)).toBe('Rain Shine')
  })
})
