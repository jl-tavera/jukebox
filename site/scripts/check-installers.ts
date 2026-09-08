import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SITE } from '../lib/content'

/**
 * Checks the two installers the site has just built. Run after `next build`, and
 * again by `deploy` before anything reaches Cloudflare.
 *
 * It reads `out/`, not `public/`, for the reason `check-discovery.ts` gives
 * about the discovery document: this fails both when a script is wrong and when
 * a build change quietly stopped publishing it. A correct `public/install.sh` is
 * worth nothing if it never makes it into the export.
 *
 * **Line endings are the whole point of this check.** `site/public/install.sh`
 * is piped straight into `sh`, and a CRLF copy fails on its own shebang -- `sh`
 * reads the interpreter as `/bin/sh\r`, which does not exist, and reports a file
 * that is plainly there as missing. `.gitattributes` pins both files to `eol=lf`
 * so a checkout cannot introduce them, but the export is built from the working
 * tree rather than from git, so anything that rewrites a file in place on
 * Windows can reintroduce CRLF after the checkout and before the deploy. That is
 * not hypothetical: it happened while #38 was being written, by a tool whose
 * default write mode translates newlines.
 *
 * Spec #29 says the install scripts are "not unit-tested; they are verified by
 * running them". This does not test their behaviour and is not trying to. It is
 * the same category of thing as the discovery check -- a publish-time assertion
 * about the bytes being served.
 *
 * **The address is the second thing checked, and #113 is why it is worth
 * checking here.** Each installer opens with a usage comment quoting the whole
 * command, address included, and `lib/content.ts` writes the same address again
 * as `SITE` to build the two commands the page hands over. Those were three
 * independent spellings of one string, agreeing only by care. They are now read
 * side by side, because #113 seeds both installers into the page's shell -- so
 * a visitor who runs `cat install.sh` reads that comment, and a domain move
 * that updated `SITE` and missed a script would put two different addresses on
 * one screen. `docs/design/SITE.md` 08 lists every other place the string
 * appears; this closes the two that a reader of the page can see at once.
 */

const OUT = (name: string) => fileURLToPath(new URL(`../out/${name}`, import.meta.url))

const fail = (...lines: string[]): never => {
  for (const line of lines) console.error(line)
  process.exit(1)
}

type Installer = {
  name: string
  /** What the first line must be, where the first line is load-bearing. */
  opens?: string
}

const INSTALLERS: Installer[] = [
  { name: 'install.sh', opens: '#!/bin/sh' },
  // No shebang to check. PowerShell is selected by the URL the user pipes into
  // `iex`, not by anything inside the file.
  { name: 'install.ps1' },
]

for (const { name, opens } of INSTALLERS) {
  const where = `site/out/${name}`

  let text: string
  try {
    text = readFileSync(OUT(name), 'utf8')
  } catch {
    fail(
      `${where} is not there.`,
      'The build did not publish it. This is what the install command fetches.',
    )
  }

  const carriageReturns = (text!.match(/\r/g) ?? []).length
  if (carriageReturns > 0) {
    fail(
      `${where} has ${carriageReturns} carriage return(s), and must have none.`,
      'A CRLF installer fails on its own first line for reasons that name no cause.',
      'Rewrite it with LF endings; .gitattributes already pins it, so a fresh',
      'checkout is one way back.',
    )
  }

  if (opens !== undefined && !text!.startsWith(opens + '\n')) {
    fail(`${where} must open with ${opens}, and does not.`)
  }

  // The whole URL rather than the origin alone, so a script quoting a sibling's
  // filename fails too -- `install.ps1` telling somebody to fetch `install.sh`
  // is the other half of the same mistake, and it is one nobody rereads a usage
  // comment carefully enough to catch.
  const fetched = `${SITE}/${name}`
  if (!text!.includes(fetched)) {
    fail(
      `${where} does not quote ${fetched} anywhere.`,
      "Its usage comment names the address a visitor pastes, and lib/content.ts's",
      'SITE builds the command the page hands over. They have to agree: since #113',
      'the page seeds this file into its shell, so both are read on one screen.',
      'docs/design/SITE.md 08 lists every place the address is written down.',
    )
  }
}

console.log(`site/out: ${INSTALLERS.map((i) => i.name).join(' and ')} are served as written.`)
