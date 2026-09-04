import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { codepoints } from './woff2'

/**
 * Checks the two webfonts the site has just built. Run after `next build`, and
 * again by `deploy` before anything reaches Cloudflare.
 *
 * It reads `out/`, not `public/`, for the reason `check-discovery.ts` gives
 * about the discovery document: this fails both when a subset is wrong and when
 * a build change quietly stopped publishing it. A correct
 * `public/fonts/monaspace-neon.woff2` is worth nothing if it never makes it into
 * the export.
 *
 * **What this is guarding.** The wordmark is built entirely from Block
 * Elements, and two of its glyphs -- U+258C and U+2590, the counter of the O --
 * appear exactly once each in sixty-seven columns. A default latin subset drops
 * every glyph in that table; the browser then substitutes them per-glyph from a
 * fallback with different metrics, and the art shears apart. It does that
 * silently, and it does it on somebody else's machine rather than on the one
 * that built the page, which is the whole reason this is a step rather than
 * something anybody would notice. `SITE.md` 03 was written about this failure
 * back when the answer to it was to ship no webfont at all; ADR-0010 traded that
 * guarantee for this check plus #83's, and said so in those terms.
 *
 * **The required set below is deliberately not imported from
 * `build-fonts.ts`.** That script's whitelist is the implementation and this
 * list is the contract, and if the two were one list then narrowing it would
 * narrow the check with it and pass. Two lists that must agree is the point:
 * the subsetter is free to be generous, and this says what it is not free to
 * drop.
 *
 * **It does not require all of Box Drawing or all of Geometric Shapes**, though
 * `build-fonts.ts` whitelists both ranges whole. Subsetting cannot add a glyph
 * the source face never carried, so a check demanding every code point in a
 * block could fail for a reason nobody can fix -- and a check that fails for an
 * unfixable reason is a check somebody deletes. It requires the whole of Block
 * Elements, which was measured present in both faces, and the exact marks the
 * page and a live menu draw.
 *
 * **The last three assertions are about the page asking for what is served, and
 * asking nobody else.** A font published and never referenced is the same
 * silent failure arriving from the other side, and it is one an eye passes over
 * even more easily. The stylesheet assertion is the only machine-check that the
 * faces are served *from this origin*, and the offsite one is the only check
 * that no other origin is reached -- together they are what makes "vendored and
 * served from the site's own origin, no request leaves for a font CDN" a thing
 * CI knows rather than a thing the diff happened to look like.
 *
 * The preload assertion is the one here that no acceptance criterion asked for,
 * so it should say why it stays. `font-display: block` was chosen in this same
 * change, and it means the wordmark holds its paint until the face arrives
 * rather than painting in a fallback first. That trade is only sound while the
 * face is preloaded; drop the link and the deliberate choice silently becomes a
 * blank first frame. A check on a coupling this change introduced is cheaper
 * than the bug report that a page "flashes empty", which names nothing.
 *
 * Spec #29's rule applies here as it does to the other two: this is a CI step
 * and not a test, because "a test would pin the file's location rather than the
 * behaviour that matters". What needs pixels is #83's -- a code point present in
 * a cmap is not proof of a correct advance width, and only a browser can say.
 */

const OUT = (name: string): string => fileURLToPath(new URL(`../out/${name}`, import.meta.url))

const fail: (...lines: string[]) => never = (...lines) => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

const point = (code: number): string =>
  `U+${code.toString(16).toUpperCase().padStart(4, '0')}`

type Requirement = {
  /** What breaks without it, in the words somebody debugging would use. */
  readonly what: string
  readonly from: number
  /** Inclusive. Omitted for a single code point. */
  readonly to?: number
}

/**
 * What both faces must still map after subsetting.
 *
 * The Block Elements entry is the whole range rather than the five glyphs the
 * art uses today, because `cli/scripts/generate-wordmark.ts` admits any of them
 * into the banner by design -- its own docblock explains why a rule naming five
 * would only teach people to edit the generator.
 */
const REQUIRED: readonly Requirement[] = [
  { what: 'printable ASCII, which is most of every line on the page', from: 0x20, to: 0x7e },
  { what: 'Block Elements: the wordmark, and the spinner quadrants', from: 0x2580, to: 0x259f },
  { what: 'the rail the menu is drawn on', from: 0x2502 },
  { what: 'the corner that closes the rail', from: 0x2514 },
  { what: 'the mark on a step waiting for an answer', from: 0x25c6 },
  { what: 'the chosen radio', from: 0x25cf },
  { what: 'the radios that were not chosen', from: 0x25cb },

  // The same widget's other three states. `lib/session/select.ts` draws only
  // the waiting one today, because the menu on the page cannot yet be answered
  // -- #86 is what makes it live, and an answered, cancelled or failed step
  // draws one of these the day it lands.
  //
  // They are here and U+2192 is not, which is the distinction worth stating
  // rather than leaving to look arbitrary: these are marks of a widget this
  // page already draws, reached by states it does not have yet. A rightwards
  // arrow is not part of that widget at all -- it only ever appeared here
  // because writing the legend's two arrows as a range swept up the code point
  // between them. One is a glyph waiting for its state; the other was a glyph
  // nothing would ever draw.
  { what: 'the mark on a step that has been answered', from: 0x25c7 },
  { what: 'the mark on a step that was cancelled', from: 0x25a0 },
  { what: 'the mark on a step that failed validation', from: 0x25b2 },

  // #85 is this code point's first consumer, which is what earns it an entry.
  // `build-fonts.ts` has shipped it all along -- its Geometric Shapes range
  // covers 25A0-25FF and its own note already calls this one "the prompt arrow"
  // -- but nothing required it, so narrowing that range would have dropped the
  // mark in front of every line the visitor types, silently, on somebody else's
  // machine. It is the distinction the note below draws, arriving from the
  // other side: a glyph the page draws today, rather than one waiting for a
  // state or one nothing would ever draw.
  { what: "the arrow on the page's own prompt", from: 0x25b8 },

  { what: 'the up arrow in the menu legend', from: 0x2191 },
  { what: 'the down arrow in the menu legend', from: 0x2193 },
  { what: 'the bullet separating the menu legend', from: 0x2022 },
  { what: 'the middle dot in the install rows and the donation note', from: 0xb7 },
  { what: 'the em dash in the page title', from: 0x2014 },
  { what: 'the ellipsis in a truncated wallet address', from: 0x2026 },
]

/** One flat list, so a report names every missing glyph rather than the first. */
const required = (): Map<number, string> => {
  const all = new Map<number, string>()

  for (const { what, from, to } of REQUIRED) {
    for (let code = from; code <= (to ?? from); code += 1) {
      if (!all.has(code)) all.set(code, what)
    }
  }

  return all
}

const FACES = ['monaspace-neon.woff2', 'monaspace-argon.woff2'] as const

const read = (name: string, whose: string): Buffer => {
  try {
    return readFileSync(OUT(name))
  } catch {
    return fail(
      `site/out/${name} is not there.`,
      `The build did not publish it. ${whose}`,
    )
  }
}

const wanted = required()

for (const face of FACES) {
  const where = `site/out/fonts/${face}`
  const bytes = read(`fonts/${face}`, 'This is a face the page is set in.')

  let mapped: Set<number>
  try {
    mapped = codepoints(new Uint8Array(bytes))
  } catch (cause) {
    fail(
      `${where} could not be read as a webfont: ${(cause as Error).message}.`,
      'It is published, so this is the file itself rather than the build. Regenerate',
      'it with `bun run --cwd site fonts:build`.',
    )
  }

  const missing = [...wanted.keys()].filter((code) => !mapped.has(code))

  if (missing.length > 0) {
    // Grouped by reason rather than listed flat: thirty-two consecutive Block
    // Elements is one mistake, and printing it as thirty-two lines buries it.
    const byReason = new Map<string, number[]>()
    for (const code of missing) {
      const reason = wanted.get(code)!
      byReason.set(reason, [...(byReason.get(reason) ?? []), code])
    }

    fail(
      `${where} maps ${mapped.size} code points, and ${missing.length} the page needs are not among them:`,
      ...[...byReason].map(
        ([reason, codes]) =>
          `  - ${reason}: ${codes.slice(0, 8).map(point).join(' ')}` +
          (codes.length > 8 ? ` and ${codes.length - 8} more` : ''),
      ),
      '',
      'Subsetting dropped them. The whitelist is UNICODES in scripts/build-fonts.ts;',
      'widen it and run `bun run --cwd site fonts:build`. A latin subset drops the',
      'whole Block Elements table, and the wordmark is built from nothing else.',
    )
  }
}

/**
 * The page asking for what is served.
 *
 * Both halves read the export too. A preload naming a file that is not there
 * costs a request and falls back silently; a file that is there and named by
 * nobody is thirty kilobytes nothing renders.
 */
const html = read('index.html', 'It is the page.').toString('utf8')

/**
 * Every stylesheet in the export, wherever the bundler decided to put it.
 *
 * Searched rather than addressed. Turbopack currently emits one file under
 * `_next/static/chunks/` with a hashed name, and both halves of that are its
 * business rather than this check's -- a path written down here would be a
 * second thing to maintain and would fail the day the bundler rearranged
 * itself, which is a failure that says nothing about fonts.
 */
const publishedStylesheets = (): string => {
  const names = readdirSync(OUT(''), { recursive: true, encoding: 'utf8' }).filter((name) =>
    name.endsWith('.css'),
  )

  if (names.length === 0) {
    fail(
      'site/out publishes no stylesheet at all.',
      'Nothing on the page selects a face, so it renders in the fallback stack.',
    )
  }

  return names.map((name) => readFileSync(OUT(name), 'utf8')).join('\n')
}

const stylesheets = publishedStylesheets()

for (const face of FACES) {
  const url = `/fonts/${face}`

  if (!html.includes(url)) {
    fail(
      `site/out/index.html never names ${url}.`,
      'The preload is gone, so the face arrives a round trip late and the wordmark',
      'is painted in a fallback first. See the two <link rel="preload"> in',
      'app/layout.tsx.',
    )
  }

  if (!stylesheets.includes(url)) {
    fail(
      `No stylesheet in site/out names ${url}.`,
      'The file is published and preloaded and nothing selects it, so the page still',
      'renders in the fallback stack. See the @font-face blocks in app/globals.css.',
    )
  }
}

/**
 * And nothing arrives from anywhere else.
 *
 * The two assertions above say the vendored faces are served and used, which is
 * most of "vendored and served from the site's own origin" -- but not the half
 * that says *no request leaves for a font CDN*. A stylesheet can name this
 * origin's fonts and a CDN's, and every check above passes while the page makes
 * the third-party request SITE.md 07 forbids outright.
 *
 * So this reads the built CSS for any off-origin reference at all, rather than
 * for a list of known font hosts. A blocklist of CDNs is a check that passes on
 * the CDN nobody thought of, and there is no legitimate off-origin URL in this
 * page's stylesheet to make room for.
 */
const OFFSITE = /(?:@import\s+(?:url\(\s*)?|url\(\s*)["']?(?:https?:)?\/\/([^"')\s/]+)/gi

const offsite = [...new Set([...stylesheets.matchAll(OFFSITE)].map((match) => match[1]!))]

if (offsite.length > 0) {
  fail(
    `A stylesheet in site/out fetches from ${offsite.length} other origin(s):`,
    ...offsite.map((host) => `  - ${host}`),
    '',
    'This page makes no request to anyone but Cloudflare. Both faces are vendored',
    'into public/fonts precisely so that none has to -- see SITE.md 07, which is a',
    'non-goal rather than a preference, and ADR-0010, which kept it through the',
    'redesign that introduced the webfont.',
  )
}

console.log(
  `site/out/fonts: ${FACES.join(' and ')} carry all ${wanted.size} code points the page needs, and the page asks for both.`,
)
