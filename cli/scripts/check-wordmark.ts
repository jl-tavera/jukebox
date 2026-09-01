import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Checks the CLI's copy of the wordmark against the site's.
 *
 * The art is duplicated rather than shared, and #50 settled why: `schema/` is the
 * client/server contract and a piece of art is not that, and one string does not
 * earn a workspace of its own. This check is what makes that duplication safe --
 * the same trade `site/scripts/check-discovery.ts` and `check-installers.ts`
 * already make, where a published artifact is verified against the truth rather
 * than imported from it. The copies also want different notes around them: the
 * site's explains a webfont fallback, the CLI's explains terminal width.
 *
 * **It reads the files rather than importing them, and that is the point.**
 * ECMAScript normalises CRLF to LF inside a template literal when the file is
 * parsed, so two modules whose bytes differ hand back identical strings. An
 * importing check would agree with itself on a Windows checkout and on a Linux
 * one while the files on disk disagreed -- and a carriage return is exactly what
 * the `eol=lf` pins in `.gitattributes` exist to keep out of art measured in
 * columns. Reading bytes also keeps the two workspaces apart: an `import` across
 * them would pull a site source file into the CLI's typecheck program, under the
 * CLI's `lib` and `types`, for a string neither program compiles against.
 *
 * A CI step and not a unit test, for the reason #29 gave about the discovery
 * document: a test would pin the constant's location rather than the property
 * that matters. Nothing imports either copy yet -- the header is drawn in #54 --
 * so there is no unit here to test.
 *
 * Run by `cli.yml`, which carries `site/lib/content.ts` in its path filter for
 * it, named as one exact file rather than a glob so the landing page's other
 * churn does not reach the CLI's suite. `site.yml` does not run it: this repo
 * runs each check in exactly one workflow, the same split both those files
 * already carry a note about.
 *
 * Not wired into any `deploy`, unlike its two neighbours. Those assert about
 * bytes `wrangler deploy` is a moment from uploading, and `discovery.json` is a
 * kill switch somebody may hand-edit without ever opening a pull request. This
 * asserts about two files in git, and every edit to either reaches CI.
 *
 * A third copy of the same art opens `docs/design/DESIGN.md`, which both checked
 * copies name as their source. It is deliberately not checked here -- #52 scopes
 * this to the two that ship -- and `docs/design/SITE.md` 03 describes a
 * fence-delimited generator for it that has never existed. Worth closing, in its
 * own ticket.
 */

/** The truth, and the copy. Named in that order everywhere below. */
const SITE = 'site/lib/content.ts'
const CLI = 'cli/src/wordmark.ts'

/** Resolved against this file rather than the cwd, so where it is run from does not matter. */
const at = (repoPath: string): string => fileURLToPath(new URL(`../../${repoPath}`, import.meta.url))

const fail = (...lines: string[]): never => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

/**
 * How both copies declare it, character for character.
 *
 * Anchoring on the declaration rather than on a line number is what lets either
 * file grow above the wordmark without moving it.
 */
const OPENS = 'export const WORDMARK = `'

const ROWS = 5
const COLUMNS = 67

/**
 * A space, or the Block Elements block.
 *
 * A range rather than the five glyphs the art happens to use today, because
 * U+2596 is perfectly good art and a check that refused it would only teach
 * people to edit the check. It is also what makes the column count below mean
 * anything: every code point this admits is in the BMP, so one UTF-16 unit is one
 * character is one column, and counting and indexing agree.
 */
const BLOCKS = /^[ ▀-▟]*$/

/** A trailing space and a row that has ended look identical every other way. */
const point = (character: string): string =>
  `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`

const read = (where: string): string => {
  try {
    return readFileSync(at(where), 'utf8')
  } catch {
    return fail(
      `${where} is not there.`,
      'It is one of the two copies of the wordmark this check compares.',
    )
  }
}

/**
 * The bytes between the declaration and the backtick that closes it.
 *
 * Every way this can come back wrong is a failure rather than an empty string.
 * Two nothings compare equal, and a check that passes because it found no art is
 * worse than no check at all.
 */
const artIn = (where: string): string => {
  const source = read(where)
  const declared = source.split(OPENS).length - 1

  if (declared !== 1) {
    return fail(
      declared === 0
        ? `${where} does not declare the wordmark.`
        : `${where} declares the wordmark ${declared} times, and must declare it once.`,
      `This check finds the art by reading: ${OPENS}`,
      'Renaming the constant, annotating its type, or reformatting the declaration',
      'all hide it from here. Update OPENS in this script alongside whichever it was.',
    )
  }

  const from = source.indexOf(OPENS) + OPENS.length
  const closes = source.indexOf('`', from)
  if (closes === -1) {
    return fail(
      `${where} opens the wordmark and never closes it.`,
      'The literal has to close on the same line the art ends on, which is how the',
      'bytes between the two backticks are known to be all of it.',
    )
  }

  const art = source.slice(from, closes)

  if (art.includes('${') || art.includes('\\')) {
    return fail(
      `${where} holds a substitution or an escape inside the wordmark.`,
      'The art has to be the bytes on disk for two copies of it to be comparable.',
      'Anything the parser computes would make the file and the string different things.',
    )
  }

  return art
}

/**
 * Each copy on its own, before either is compared to the other.
 *
 * Not folded into the comparison, and the order is load-bearing: two copies that
 * drifted together -- both rewritten CRLF, or both run through something that
 * trims trailing whitespace -- extract to equal strings and would sail through an
 * equality check alone. This is what catches that.
 */
const rowsOf = (where: string): string[] => {
  const art = artIn(where)

  const carriageReturns = (art.match(/\r/g) ?? []).length
  if (carriageReturns > 0) {
    fail(
      `${where} has ${carriageReturns} carriage return(s) inside the wordmark, and must have none.`,
      'A template literal parses CRLF as LF, so both programs still print the same',
      'string -- this is about the bytes, which is what a column is counted in.',
      '.gitattributes pins the file to eol=lf; deleting it and checking it out again',
      'is one way back.',
    )
  }

  const rows = art.split('\n')
  if (rows.length !== ROWS) {
    fail(
      `${where} has ${rows.length} row(s) of wordmark, and must have ${ROWS}.`,
      'The art is a rectangle. Anything else is five ragged strings.',
    )
  }

  for (const [index, row] of rows.entries()) {
    // Before the width, because it is what lets the width be counted this way.
    if (!BLOCKS.test(row)) {
      const stray = [...row].find((character) => !BLOCKS.test(character))!
      fail(
        `${where} row ${index + 1} contains ${point(stray)}, which this art is not built from.`,
        'It is spaces and Block Elements (U+2580-U+259F) and nothing else, because those',
        'are what a terminal font and an unsubsetted webfont can both be relied on to',
        'carry. A glyph outside them fails silently, on a machine that is not this one.',
      )
    }

    if ([...row].length !== COLUMNS) {
      fail(
        `${where} row ${index + 1} is ${[...row].length} columns, and must be ${COLUMNS}.`,
        'Rows that do not measure the same shear the letterforms apart. Two of them end',
        'in a space that anything trimming trailing whitespace will take, and that is',
        'usually what happened.',
      )
    }
  }

  return rows
}

/**
 * Where they part, said as a row, a column and a code point.
 *
 * Printing two blocks of Block Elements and leaving the reader to hold them up to
 * the light is not a message. By here both sides are known to be ROWS rows of
 * COLUMNS columns, so the indices line up and every difference has a name.
 */
const difference = (site: string[], cli: string[]): string[] => {
  for (const [index, row] of site.entries()) {
    const other = cli[index]!
    if (row === other) continue

    for (let column = 0; column < COLUMNS; column++) {
      if (row[column] === other[column]) continue
      return [
        `They first differ at row ${index + 1}, column ${column + 1}:`,
        `  ${SITE} has ${point(row[column]!)}`,
        `  ${CLI} has ${point(other[column]!)}`,
      ]
    }
  }

  return []
}

const site = rowsOf(SITE)
const cli = rowsOf(CLI)

if (site.join('\n') !== cli.join('\n')) {
  fail(
    `${CLI} does not carry the same wordmark as ${SITE}.`,
    ...difference(site, cli),
    'One piece of art in two places. The site is the one to change first, and the CLI',
    'copy is extracted from it rather than edited to match by eye.',
  )
}

console.log(`${CLI} carries ${SITE}'s wordmark: ${ROWS} rows of ${COLUMNS}, byte for byte.`)
