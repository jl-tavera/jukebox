import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { INVENTED, LIBRARY, MACHINE, MIRROR, TERMS } from '../lib/session/machine'

/**
 * The invented half of the shell's filesystem, held to the glossary.
 *
 * **This is the only file on the page whose job is checking vocabulary, and it
 * exists because #113 seeds output nobody generated.** Everything else the
 * terminal prints is either the binary's own words -- generated into
 * `lib/content.ts` and diffed by `cli.yml` -- or the page's own copy, reviewed
 * as copy. A Library and a Mirror are neither. They are invention, and the
 * ticket's answer to that is a rule rather than a review: every domain word in
 * them comes from `CONTEXT.md`, and none of the synonyms that document tells us
 * to avoid appears at all.
 *
 * A rule of that shape is worth nothing unless something checks it, so this
 * reads the glossary rather than restating it. A term added to `CONTEXT.md`
 * becomes available here with no edit; a synonym added to an `_Avoid_` line
 * starts being enforced the same way. The alternative -- a list of words copied
 * into this file -- is the exact failure the glossary exists to prevent, made
 * out of the glossary.
 *
 * `docs/agents/domain.md` is the rule this automates: *"use the term as defined
 * in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids."*
 */

/**
 * The glossary, with its line endings normalised on the way in.
 *
 * `CONTEXT.md` is not pinned in `.gitattributes` and does not need to be -- it
 * is prose, and nothing measures it in columns. This file parses it with
 * anchored patterns, though, and on a CRLF checkout a newline written after
 * `**Track**:` matches nothing at all. Dropping the carriage returns on the way
 * in is cheaper than pinning a document for the sake of its one reader, and it
 * is what `cli/scripts/generate-wordmark.ts` does on the way in for the same
 * reason.
 */
const GLOSSARY = readFileSync(
  fileURLToPath(new URL('../../CONTEXT.md', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n')

/** Every path the invented half puts on the filesystem, and everything written into one. */
const SEEDED = Object.entries(MACHINE)

/**
 * Everything the invented half says, as one string: the paths and the contents.
 *
 * Both halves, because a word can reach a visitor either way. A word inside a
 * file and a word in a path are equally on the screen once somebody runs `ls`,
 * and a check that read only the file bodies would let a directory called
 * `cache` through without a murmur.
 */
const EVERYTHING = SEEDED.flat().join('\n')

/**
 * What `CONTEXT.md` gives us to spend, gathered three ways.
 *
 * **Bold spans** are the glossary's own headings -- `**Playlist**`, `**Tier**`
 * -- and also the words it emphasises inside a definition, which is how
 * `**title**` earns its place without being an entry of its own.
 *
 * **Backticked spans** are the enumerated values: `exact`, `probable`, `weak`
 * and `none` live inside Tier's sentence rather than as headings, and they are
 * the four words the ticket most wants on the screen.
 *
 * **Track's own field list** is the third and the least mechanical, so it is
 * parsed off that one entry rather than off the document: a Track is *"title,
 * artists, album, duration, ISRC, cover image, position"*, and those are the
 * column headings a record of Tracks is going to have. Read from the Track
 * definition specifically, because taking every comma-separated word in the
 * document would amount to allowing every word in it.
 */
const vocabulary = (): Set<string> => {
  const words = new Set<string>()

  const add = (word: string): void => {
    const cleaned = word.trim().toLowerCase()
    if (cleaned === '') return

    words.add(cleaned)
    // Singular and plural both, so `artists` in the glossary answers for
    // `ARTIST` in a column heading. The glossary is written in whichever number
    // reads best and a record in whichever fits a column, and neither should
    // have to bend to the other.
    if (cleaned.endsWith('s')) words.add(cleaned.slice(0, -1))
    words.add(`${cleaned}s`)
  }

  for (const [, bold] of GLOSSARY.matchAll(/\*\*([^*]+)\*\*/g)) add(bold!)
  for (const [, code] of GLOSSARY.matchAll(/`([^`]+)`/g)) add(code!)

  const track = /\*\*Track\*\*:\n([^\n]+)/.exec(GLOSSARY)?.[1] ?? ''
  const fields = /as the source describes it: ([^.]+)\./.exec(track)?.[1] ?? ''
  for (const field of fields.split(',')) add(field)

  return words
}

/**
 * The synonyms the glossary tells us not to use, read off its `_Avoid_` lines.
 *
 * **Those lines are prose, not lists, so this parses conservatively and drops
 * what it cannot read.** *Parsing, importing, scraping* is a list. *A field or
 * column called `name` -- that is the source's own word for it* is a sentence,
 * and a parser that split it on commas would forbid `title`, `source` and
 * `word`: half the vocabulary, taken away by the line that grants it.
 *
 * So parentheticals go first, because two of them contain both a comma and a
 * semicolon and would otherwise swallow the words after them. The remainder is
 * cut at the first em dash or semicolon, which is where every one of these
 * lines stops listing and starts explaining. What is left is split on commas,
 * and only entries of one or two plain words survive.
 *
 * The cost is that the lines written as sentences contribute nothing, and
 * Playlist's is the one that matters -- *avoid a field or column called
 * `name`*. That is honoured by the record calling its column `TITLE`, and it is
 * honoured by review rather than by this function.
 */
const avoided = (): Set<string> => {
  const words = new Set<string>()

  for (const [, line] of GLOSSARY.matchAll(/^_Avoid_: (.+)$/gm)) {
    const listing = line!.replace(/\([^)]*\)/g, '').split(/[\u2014;]/)[0] ?? ''

    for (const candidate of listing.split(',')) {
      const word = candidate.trim().toLowerCase()
      if (/^[a-z]+( [a-z]+)?$/.test(word)) words.add(word)
    }
  }

  return words
}

/**
 * The words this check has to be told about, each for its own reason.
 *
 * **Neither is a synonym slipping through.** `entry` and `entries` are avoided
 * as synonyms for **Track** -- and they are simultaneously **Skipped**'s own
 * word, in that entry's own definition: *"How many entries a source offered
 * that never became tracks"*. So `1 entry skipped` is the correct sentence and
 * the forbidden word at once, and no parser can tell those apart, because the
 * difference is which term is being named rather than which letters are on the
 * line.
 *
 * `catalog` is avoided as a synonym for **Library** while being a glossary term
 * in its own right. It is named here rather than relied upon: nothing in the
 * invented half mentions a Catalog today, and if something ever does, this line
 * is where a reader finds out the word was considered.
 */
const ALLOWED = new Set(['entry', 'entries', 'catalog'])

/**
 * The CLI's own output furniture: words a record carries that are not domain
 * terms and are not invented names.
 *
 * **Every one of these is quoted from `cli/`, which is the whole reason they
 * are allowed.** They are the joins and labels the binary prints around its
 * own vocabulary, and a page reproducing its output has to reproduce them or
 * be reproducing something else:
 *
 * - `and`, `still`, `recorded`, `here` -- `show.ts`'s `REMOVED_HEADING`, which
 *   reads *"Removed, and still recorded here:"*.
 * - `left` -- what `show.ts` prints beside a Track that has gone, as
 *   `left <timestamp>`.
 * - `time` -- `show.ts`'s `TIME` column heading, over a duration.
 * - `updated` -- `list`'s last column. `README.md` is explicit that it says
 *   *updated* rather than *synced* on purpose: a Sync that finds nothing
 *   changed writes nothing, so the moment recorded is when this copy last
 *   moved.
 *
 * Listed rather than pattern-matched, so adding a word to a record is a
 * decision somebody makes here with a reason beside it.
 */
const FURNITURE = new Set(['and', 'still', 'recorded', 'here', 'left', 'time', 'updated'])

describe('the words the invented half is allowed to use', () => {
  it('declares every domain term it puts on the screen', () => {
    // The list is exported rather than derived, and that is the point of it: a
    // word reaches a visitor because somebody wrote it into a record, so the
    // module says which words those are and this asserts the glossary grants
    // each one. Deriving the list by scanning the text for domain-looking words
    // would be this test guessing at what it is checking.
    const granted = vocabulary()

    expect(TERMS.filter((term) => !granted.has(term.toLowerCase()))).toEqual([])
  })

  it('actually uses every term it declares', () => {
    // The other direction, and it is what stops `TERMS` becoming a wishlist. A
    // term declared and never printed makes the assertion above pass for a word
    // no visitor will ever see.
    //
    // Plural-tolerant here and nowhere else: a record says `4 tracks` and a
    // path is named `playlists.txt`, so a bare boundary after `track` finds
    // neither -- an `s` is a word character, and the eye sees a break the regex
    // does not.
    const unused = TERMS.filter((term) => !new RegExp(`\\b${term}s?\\b`, 'i').test(EVERYTHING))

    expect(unused).toEqual([])
  })

  it('uses none of the synonyms the glossary avoids', () => {
    const forbidden = [...avoided()].filter((word) => !ALLOWED.has(word))

    // Whole words, which is what keeps a setting named `library_path` from
    // reading as the avoided `library`: an underscore is a word character, so
    // there is no boundary between the two halves and the CLI's own spelling
    // survives intact.
    const found = forbidden.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(EVERYTHING))

    expect(found).toEqual([])
  })

  it('puts no word in a record that is neither a term nor a name', () => {
    // **The criterion read strictly: *every word in it comes from the domain
    // glossary*.** The two cases above check the declared vocabulary in both
    // directions, and a code review found what that still misses -- a word can
    // reach a record without ever being declared, and nothing was looking at
    // the text itself. `TIME` and `updated` both arrived that way.
    //
    // So this reads the records and accounts for every word in them. What is
    // left after the glossary's own vocabulary and the invented names is the
    // CLI's output furniture, which is listed below rather than waved through.
    const prose = Object.entries(MACHINE)
      .filter(([path]) => path.startsWith(`${MIRROR}/`))
      .map(([, contents]) => contents)
      .join('\n')

    const granted = vocabulary()
    const names = new Set(
      INVENTED.flatMap((name) => name.toLowerCase().split(/[^a-z]+/i)).filter((word) => word !== ''),
    )

    // `ALLOWED` counts here too, and `entry` is why. The glossary grants it to
    // **Skipped** inside that entry's own definition while avoiding it as a
    // synonym for **Track**, so it is a real word of the domain that no parse
    // of the headings can find. It is accounted for above rather than twice.
    const unaccounted = [...new Set(prose.toLowerCase().match(/[a-z]+/g) ?? [])].filter(
      (word) =>
        !granted.has(word) && !names.has(word) && !FURNITURE.has(word) && !ALLOWED.has(word),
    )

    expect(unaccounted).toEqual([])
  })

  it('reads a glossary that still has the shape this file parses', () => {
    // Every assertion above passes loudly against a glossary this file failed
    // to parse, so this is where the parse itself is checked: one word from
    // each of the three gathering rules, and two avoided synonyms -- one of
    // which only survives the parenthetical-stripping.
    const granted = vocabulary()

    expect(granted.has('playlist')).toBe(true)
    expect(granted.has('none')).toBe(true)
    expect(granted.has('album')).toBe(true)
    expect(avoided().has('store')).toBe(true)
    expect(avoided().has('song')).toBe(true)
  })
})

describe('the Library and the Mirror it is recorded in', () => {
  it('gives every Playlist folder its own directory under the Library', () => {
    const folders = new Set(
      SEEDED.map(([path]) => path)
        .filter((path) => path.startsWith(`${LIBRARY}/`))
        .map((path) => path.slice(LIBRARY.length + 1).split('/')[0]),
    )

    expect([...folders].sort()).toEqual(['Late Shift', 'Rain Shine'])
  })

  it('records at least one Track whose match has tier none', () => {
    // The ticket's own criterion, and the reason the invented half is allowed
    // to exist at all: `none` is a correct and common answer rather than a
    // failure, and a Library where everything matched would be the page lying
    // about coverage in exactly the way the deleted recording existed to
    // prevent.
    expect(EVERYTHING).toContain('none')
  })

  it('has no file in the Library for the Track that matched nothing', () => {
    // The honest half of the coverage story, and the one a visitor finds by
    // looking rather than by being told. A tier of `none` means no Catalog Item
    // was found, so there was nothing to download and there is no file.
    //
    // Five rows against four files, and the two absences are different:
    // `Nightjar` has no file because nothing matched it, while `Winter Ledger`
    // is Removed and keeps the one it had -- `CONTEXT.md` is explicit that the
    // word "never implies a file was deleted".
    const held = SEEDED.map(([path]) => path).filter((path) =>
      path.startsWith(`${LIBRARY}/Late Shift/`),
    )

    expect(held).toHaveLength(4)
    expect(held.some((path) => path.includes('Nightjar'))).toBe(false)
    expect(held.some((path) => path.includes('Winter Ledger'))).toBe(true)
  })

  it('names every file the way a filesystem the CLI reads would allow', () => {
    // `cli/src/folders.ts`'s FORBIDDEN, which is what a Playlist title is put
    // through before it becomes a directory. The page cannot import it --
    // `site/` does not depend on `cli/` -- so the rule is restated and the
    // seeded names are held to it. A folder named `Rain / Shine` would be two
    // directories and a Library nobody could reproduce.
    const forbidden = /[<>:"\\|?*\u0000-\u0008\u000e-\u001f]/

    for (const [path] of SEEDED) {
      for (const segment of path.slice(1).split('/')) {
        expect(segment).not.toMatch(forbidden)
        expect(segment).not.toMatch(/[. ]$/)
      }
    }
  })

  it('writes every record it says it keeps under the Mirror', () => {
    const records = SEEDED.map(([path]) => path).filter((path) => path.startsWith(`${MIRROR}/`))

    expect(records.sort()).toEqual([
      `${MIRROR}/Late Shift.txt`,
      `${MIRROR}/Rain Shine.txt`,
      `${MIRROR}/playlists.txt`,
    ])
  })

  it('seeds no empty directory, which the shell could not hold anyway', () => {
    // `InitialFiles` is a map of files; `InMemoryFs` creates the parents it
    // needs and has no way to express a directory with nothing in it. A path
    // ending in a slash would silently become nothing at all.
    for (const [path, contents] of SEEDED) {
      expect(path.endsWith('/')).toBe(false)
      expect(typeof contents).toBe('string')
    }
  })
})
