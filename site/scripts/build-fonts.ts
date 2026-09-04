import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Writes the two subset webfonts the page is set in, from the Monaspace release
 * ADR-0010 measured.
 *
 * **Run by hand, and by nothing else.** The `.woff2` files it writes are
 * committed, so neither CI nor `deploy` runs this -- which is the whole reason
 * `site.yml` still installs one runtime and nothing else. `check-fonts.ts` is
 * the half that runs on every build, and it needs no toolchain at all. The
 * asymmetry is deliberate: this script reaches the network and shells out to
 * Python, and a step doing either of those on every pull request is a step
 * somebody eventually deletes.
 *
 * **Two faces, because the page has two voices.** ADR-0010 splits the binary's
 * vocabulary from the site's and carries the split in the typeface rather than
 * in the prompt glyph alone -- Neon for everything the binary printed, Argon
 * for the lines a human wrote. Monaspace builds both at identical metrics, so
 * the voice changes without the character grid moving a column. That shared
 * metric is the only reason the split is affordable, and it is why these two
 * faces are not interchangeable with any other pair.
 *
 * **The whitelist is wider than the three ranges ADR-0010 names, on purpose.**
 * Block Elements, Box Drawing and Geometric Shapes are the three the document
 * lists, and they are not sufficient: the menu's footer legend reads
 * `[up]/[down] to navigate * Enter: confirm` with real glyphs for all three of
 * those marks, and every one of them sits outside all three ranges. A whitelist
 * built by reading the ADR alone drops the legend, and nothing says so. Each
 * entry below carries what needs it.
 *
 * **The whole Block Elements range, not the five glyphs the art uses.**
 * `cli/scripts/generate-wordmark.ts` admits any of U+2580-U+259F into the
 * banner by design, and its own docblock explains why a rule naming five glyphs
 * would only teach people to edit the generator. A subset narrower than what
 * the art is allowed to contain is a subset that breaks on an edit nobody
 * thought was risky.
 *
 * **Variable, with the other two axes dropped.** Monaspace ships one variable
 * file per face carrying `wght`, `wdth` and `slnt`. Pinning the last two to
 * their defaults takes each source from ~1.6MB to ~740KB before subsetting even
 * starts, and keeping `wght` means the design's bold step costs no second file
 * and no second request. Four static instances is the alternative, and it is
 * four files, four preloads, and a fifth the day a third weight is wanted.
 *
 * Monaspace's own `wght` default is 200 rather than 400 -- upstream, in the
 * sources these are cut from. Nothing here changes it and nothing needs to: the
 * `@font-face` in `globals.css` declares the range and the browser instances
 * 400 for body text and 700 for bold. It is recorded because a reader checking
 * `fvar` against the CSS would otherwise think one of the two was wrong.
 *
 * **Sources are fetched and checksummed rather than committed.** Two 1.6MB
 * binaries in git history buy offline reproducibility for a script that runs
 * about twice a year; a pinned tag and a pinned digest buy provenance, which is
 * the property actually worth having. If either file upstream ever stops
 * hashing to what is written below, this fails and says so rather than quietly
 * subsetting something else.
 *
 * **fontTools, reached through `uv`.** It is the reference implementation of
 * both operations and it is Python, so there is no version of this that is
 * TypeScript. `uvx` runs it from an ephemeral environment, which is what keeps
 * it out of `bun.lock` and out of every other workspace. Nothing else in this
 * repo needs Python, and nothing else gains it.
 */

/** The release ADR-0010 read its coverage numbers out of. */
const RELEASE = 'v1.400'

const RAW = `https://raw.githubusercontent.com/githubnext/monaspace/${RELEASE}`

/** Where the subset faces are written, and where `next build` copies them from. */
const FONTS = fileURLToPath(new URL('../public/fonts/', import.meta.url))

/**
 * Where the broken copy goes, and the reason it is not under `public/`.
 *
 * Nothing here is served. `next build` copies `public/` into the export
 * verbatim, so a deliberately incomplete face living there would ship -- and
 * `check:fonts` would then have a second `out/fonts/*.woff2` to explain.
 * Playwright reads this off disk and fulfils a request with it.
 */
const FIXTURES = fileURLToPath(new URL('../e2e/fixtures/', import.meta.url))

/**
 * What survives subsetting.
 *
 * A range and a reason rather than one bare argument string, because the reason
 * is the part that stops the next person narrowing it. The ranges are
 * `pyftsubset`'s own syntax: bare hex, no `U+`.
 */
const UNICODES: readonly (readonly [range: string, why: string])[] = [
  ['20-7E', 'printable ASCII'],
  ['B7', 'MIDDLE DOT, in the install rows and the donation note (#91, #88)'],
  ['2014', 'EM DASH, in the page title'],
  ['2022', 'BULLET, the menu legend separator'],
  ['2026', 'HORIZONTAL ELLIPSIS, in a truncated wallet address (#88)'],
  ['2191,2193', 'UP and DOWN ARROW, the menu legend'],
  ['2500-257F', 'Box Drawing: the rail, and the corner that closes it'],
  ['2580-259F', 'Block Elements: the wordmark, and the spinner quadrants'],
  ['25A0-25FF', 'Geometric Shapes: the step mark, the radios, the prompt arrow'],
]

type Face = {
  /** What it is called upstream, under `fonts/Variable Fonts/`. */
  readonly upstream: string
  /** SHA-256 of that file at `RELEASE`. */
  readonly sha256: string
  /** What this writes into `public/fonts/`. */
  readonly writes: string
  /**
   * A deliberately incomplete copy, written into `e2e/fixtures/` rather than
   * into `public/`.
   *
   * **This one is meant to be broken, and #83 is why it exists.** The Playwright
   * harness measures five rows of the wordmark and fails them if they are not
   * the same width -- but an assertion that has never been seen to fail is a
   * claim rather than a check. So a spec serves this face in place of the real
   * one and asserts that the rows *do* shear, which is what makes the guard
   * next to it mean something.
   *
   * Latin only. Keeping the space and dropping every Block Element is exactly
   * the subsetting mistake the whole arrangement guards against: the page then
   * takes its spaces from this file and its blocks from the fallback stack, at a
   * different advance, and rows carrying different numbers of each stop
   * agreeing. Serving *no* face would not reproduce it -- every glyph would fall
   * back together and the rows would stay equal -- so the simulation has to be a
   * partial font rather than a missing one.
   *
   * It never reaches `public/`, so it is never published. Playwright reads it
   * off disk and fulfils the request with it.
   */
  readonly fixture?: { readonly unicodes: string; readonly writes: string }
}

const FACES: readonly Face[] = [
  {
    upstream: 'Monaspace Neon/Monaspace Neon Var.ttf',
    sha256: 'e3cc8bf1c4a0384309d584c0dce9291166535066c538e60e2d5ac444b76fec4c',
    writes: 'monaspace-neon.woff2',
    fixture: { unicodes: '20-7E', writes: 'neon-without-block-elements.woff2' },
  },
  {
    upstream: 'Monaspace Argon/Monaspace Argon Var.ttf',
    sha256: '52240be874e817eb14ad653234a229801d22f2a4520dbe28d19732c7a3c3407e',
    writes: 'monaspace-argon.woff2',
  },
]

/**
 * The licence, fetched rather than transcribed.
 *
 * Monaspace is SIL OFL 1.1, which requires the licence to travel with the font.
 * It is served beside the two faces for that reason, and checksummed for the
 * reason they are: a licence file that quietly became a different licence file
 * is exactly the change nobody reads a diff for.
 */
const LICENCE = {
  upstream: 'LICENSE',
  sha256: '0e84e5f7dd6f05e74a00f2fb828ca43e489d954f5509ff0fa439ea18c0d35fe9',
  writes: 'OFL.txt',
} as const

/**
 * Annotated on the binding rather than on the arrow, for the reason
 * `cli/scripts/generate-wordmark.ts` gives at length: TypeScript narrows after
 * a call only when the variable is typed as returning `never`, so with the
 * annotation on the arrow alone the code after every bare `fail(...)` below
 * stays reachable, and the reader is handed assertions to paper over it.
 */
const fail: (...lines: string[]) => never = (...lines) => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Fetched, then checked, then handed on. Nothing downstream ever sees unverified bytes. */
const fetchPinned = async (path: string, sha256: string): Promise<Uint8Array> => {
  const url = `${RAW}/${path.split('/').map(encodeURIComponent).join('/')}`

  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    return fail(`Could not reach ${url}: ${(cause as Error).message}`)
  }

  if (!response.ok) {
    return fail(
      `${url} answered ${response.status}.`,
      `The tag is pinned to ${RELEASE}. If upstream moved the file, the path in this`,
      'script is what needs updating -- along with the digest beside it.',
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const found = digest(bytes)

  if (found !== sha256) {
    fail(
      `${path} does not hash to what this script expects.`,
      `  expected  ${sha256}`,
      `  found     ${found}`,
      'A pinned tag serving different bytes than it did is the one case this check',
      'exists for. Do not update the digest without finding out why it moved.',
    )
  }

  return bytes
}

/** fontTools, from an ephemeral environment. `[woff]` is what pulls in the brotli woff2 needs. */
const fontTools = (...args: string[]): void => {
  try {
    execFileSync('uvx', ['--from', 'fonttools[woff]', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch (cause) {
    fail(
      `fontTools failed: ${args.join(' ')}`,
      String((cause as { stderr?: Buffer }).stderr ?? (cause as Error).message).trimEnd(),
      '',
      'This script needs `uv` on PATH: https://docs.astral.sh/uv/. It is the only',
      'thing in this repo that does, and nothing in CI runs it.',
    )
  }
}

/**
 * One subset, from an instanced face to a `.woff2`.
 *
 * `+calt` keeps Monaspace's texture healing, which is contextual substitution
 * at unchanged advance widths -- it cannot move the grid. Discretionary
 * ligatures stay off: this page quotes shell commands, and an arrow arriving
 * where somebody typed `->` would be the page rewriting what the binary
 * printed.
 *
 * Both the faces that ship and the harness's deliberately incomplete one go
 * through here, and that is worth more than the duplication it saves. The
 * fixture has to differ from what ships in its code point range and in nothing
 * else -- same source, same instancing, same flags -- or a test measuring
 * against it would be reacting to a subsetting option rather than to a missing
 * glyph.
 */
const subset = (from: string, unicodes: string, to: string): void =>
  fontTools(
    'pyftsubset',
    from,
    `--unicodes=${unicodes}`,
    '--layout-features=+calt',
    '--flavor=woff2',
    `--output-file=${to}`,
  )

const work = mkdtempSync(join(tmpdir(), 'jukebox-fonts-'))
const wrote: string[] = []

try {
  const ranges = UNICODES.map(([range]) => range).join(',')

  for (const face of FACES) {
    const source = join(work, 'source.ttf')
    const pinned = join(work, 'pinned.ttf')
    const out = join(FONTS, face.writes)

    writeFileSync(source, await fetchPinned(`fonts/Variable Fonts/${face.upstream}`, face.sha256))

    // Both axes pinned before subsetting rather than after: the outlines dropped
    // here are outlines the subsetter would otherwise carry through every step.
    fontTools('fonttools', 'varLib.instancer', '-o', pinned, source, 'wdth=drop', 'slnt=drop')

    subset(pinned, ranges, out)

    wrote.push(`  public/fonts/${face.writes}  ${statSync(out).size} bytes`)

    // Cut from the same instanced source as the face above, which is what makes
    // it a useful lie: identical metrics for every glyph it does carry, so the
    // only thing the harness can be reacting to is the glyphs it does not.
    if (face.fixture !== undefined) {
      const broken = join(FIXTURES, face.fixture.writes)

      mkdirSync(FIXTURES, { recursive: true })
      subset(pinned, face.fixture.unicodes, broken)

      wrote.push(
        `  e2e/fixtures/${face.fixture.writes}  ${statSync(broken).size} bytes (deliberately incomplete)`,
      )
    }
  }

  const licence = join(FONTS, LICENCE.writes)
  writeFileSync(licence, await fetchPinned(LICENCE.upstream, LICENCE.sha256))
  wrote.push(`  public/fonts/${LICENCE.writes}  ${statSync(licence).size} bytes`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(
  `Subset Monaspace ${RELEASE} to ${UNICODES.length} whitelisted ranges:`,
  ...wrote.map((line) => `\n${line}`),
  '\n\nRun `bun run --cwd site build && bun run --cwd site check:fonts` to check the export.',
)
