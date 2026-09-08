import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME } from './session/machine'

/**
 * The files the site actually publishes, read at build time -- #113.
 *
 * **The point of this file is that nothing here is transcribed.** A visitor can
 * `cat install.sh` in the page's shell and read the exact bytes that
 * `curl … | sh` would fetch, before deciding whether to run it. That is the
 * strongest form of the page explaining itself: it is no longer describing the
 * install, it is showing it. And it adds no eighth copy of the site's address
 * to this repo -- `docs/design/SITE.md` 08 keeps the count -- because the
 * address a visitor reads here comes out of the published file rather than out
 * of a constant somebody typed beside it.
 *
 * **Server-only, and `app/page.tsx` is the only importer.** This reaches for
 * `node:fs`, which exists on the build machine and nowhere else. The page is a
 * server component in a static export, so it runs once at prerender and the
 * strings travel to the browser as props -- no runtime, no route handler, and
 * nothing here contradicting `SITE.md` 07's *no SSR* invariant. `page.tsx`
 * computed at build time this way before #112 and stopped; this is that seam
 * coming back for a different reason.
 *
 * **Read from `public/` rather than `out/`, which is the one asymmetry worth
 * naming.** Every `scripts/check-*.ts` in this workspace reads the export
 * instead, on the grounds that a correct source file that never gets copied is
 * a file the site does not serve. That reasoning is right and it cannot be
 * followed here: `out/` is what this build is in the middle of producing.
 * `e2e/files.spec.ts` closes the gap from the other end -- it digests what the
 * Worker serves and compares it against what the shell holds, so a `public/`
 * file that stopped reaching the export fails there.
 *
 * **Carriage returns are deliberately not stripped.** Both installers are
 * pinned LF in `.gitattributes`, `next build` copies `public/` verbatim, and
 * `scripts/check-installers.ts` fails on a `\r` in the export. Normalising here
 * would hide a difference between what the shell shows and what the site serves
 * -- which is the one thing this module exists to make true.
 */

/**
 * Where the published files sit, relative to the directory a build runs in.
 *
 * `process.cwd()` is `site/` under `next build`, including through the root
 * `bun run build`, which is `bun run --cwd site build`. `import.meta.url` would
 * be the more obvious choice and is the wrong one: this module is bundled, so
 * by the time it runs its own URL names a file inside `.next/` rather than the
 * source next to `public/`.
 */
const AT: Record<string, string> = {
  'install.sh': 'public/install.sh',
  'install.ps1': 'public/install.ps1',
  'discovery.json': 'public/discovery.json',

  // The one that is not published by this Worker at all. `README.md` is the
  // source of truth for user-facing copy (`docs/design/DESIGN.md` L22) and the
  // page already lifts its tagline and lede verbatim; seeding the whole
  // document lets a visitor read the rest of what those two sentences are the
  // opening of. It lives a directory up, which `.github/workflows/site.yml`'s
  // path filter has to name -- `lib/content.ts` already reaches across to
  // `cli/package.json` and the filter names that for the same reason.
  'README.md': '../README.md',
}

const read = (name: string, where: string): string => {
  try {
    return readFileSync(join(process.cwd(), where), 'utf8')
  } catch (cause) {
    // A build-time throw rather than an empty file, because the alternative is
    // a landing page that offers to show somebody an installer and prints
    // nothing. `scripts/check-discovery.ts` fails the same way and gives the
    // same reason: the document going missing is exactly what a check is for.
    throw new Error(
      `${where} is not there, so the shell would have no ${name} to show. ` +
        `Read from ${process.cwd()}. Cause: ${(cause as Error).message}`,
    )
  }
}

/**
 * Every real artifact, keyed by where the shell keeps it.
 *
 * The home directory rather than a made-up document root: a visitor's first
 * `ls` should answer with things they can read, and `cat install.sh` is one
 * word shorter than any path that spelled out where a web server keeps its
 * files. The invented half sits alongside under `Music/`.
 */
export const published = (): Record<string, string> =>
  Object.fromEntries(Object.entries(AT).map(([name, where]) => [`${HOME}/${name}`, read(name, where)]))
