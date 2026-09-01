import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pkg from '../package.json'

/**
 * The five binaries a release is made of, compiled from one place.
 *
 * The table lives here rather than in a workflow matrix so that it is written
 * once. A matrix would spell every target a second time in YAML, and the copy
 * that drifted would be the one nobody ran locally -- which on this project is
 * every target but Windows, because Windows is the machine the developer is on.
 *
 * Runnable by hand for exactly that reason: `bun run --cwd cli build` proves the
 * macOS build compiles from a Windows keyboard, before a tag exists to find out
 * with.
 */

/**
 * `bun build --compile` names a platform the way Bun's own installer does. The
 * five here are #38's five: macOS on both architectures, Linux on both, and
 * Windows on x64.
 *
 * The asset name is what a release carries and what both installers ask for, so
 * these strings are a published interface -- `site/public/install.sh` and
 * `install.ps1` build their download URL out of them. Renaming one breaks every
 * installer already in someone's shell history.
 */
const TARGETS = [
  { target: 'bun-darwin-arm64', asset: 'jukebox-darwin-arm64' },
  { target: 'bun-darwin-x64', asset: 'jukebox-darwin-x64' },
  { target: 'bun-linux-arm64', asset: 'jukebox-linux-arm64' },
  { target: 'bun-linux-x64', asset: 'jukebox-linux-x64' },
  { target: 'bun-windows-x64', asset: 'jukebox-windows-x64.exe' },
] as const

/** The shebang'd entry point the shipped binary is compiled from. */
const ENTRY = join(import.meta.dir, '..', 'src', 'index.ts')

/** Where the five land, and what `gh release create` uploads out of. */
const OUT = join(import.meta.dir, '..', 'dist')

/**
 * What the installers verify a download against; `site/public/install.sh`
 * carries the reasoning.
 *
 * Written in `sha256sum`'s own format, so `sha256sum -c`, `shasum -a 256 -c` and
 * PowerShell's `Get-FileHash` all read it without being told anything.
 */
const CHECKSUMS = 'SHA256SUMS'

/**
 * Two things Bun's own documentation says about cross-compiling, both of which
 * are accepted here rather than worked around:
 *
 * **The Windows metadata flags do not survive it.** `--windows-title`,
 * `--windows-publisher` and their neighbours depend on Windows APIs, so a
 * binary cross-compiled from Linux CI carries none of them. Building each target
 * on its own native runner would buy them back, at the cost of five jobs whose
 * toolchains can drift apart. For an unsigned 0.1.0 the metadata is worth less
 * than the single build everything is cut from -- and the SmartScreen warning
 * that metadata would soften is a known issue with a signing fix, not a naming
 * one.
 *
 * **x64 defaults to the modern build.** Bun's x64 binaries use AVX2, and a CPU
 * older than roughly 2013 meets `Illegal instruction` instead of a version
 * number. The fix is a `-baseline` variant, which is a sixth and seventh binary
 * -- #38 asks for five. Worth knowing before reading such a report as a bug in
 * this CLI.
 */
const compile = async ({ target, asset }: (typeof TARGETS)[number]): Promise<void> => {
  const outfile = join(OUT, asset)

  const built = Bun.spawn(
    ['bun', 'build', '--compile', `--target=${target}`, ENTRY, '--outfile', outfile],
    { stdout: 'inherit', stderr: 'inherit' },
  )

  const code = await built.exited
  if (code !== 0) throw new Error(`${target} did not compile (bun build exited ${code})`)
}

const checksums = async (): Promise<string> => {
  const lines: string[] = []

  for (const { asset } of TARGETS) {
    const bytes = await readFile(join(OUT, asset))
    const digest = createHash('sha256').update(bytes).digest('hex')

    // Two spaces and a bare filename, which is what `-c` expects to read back.
    // A path would make the check depend on where the file was verified from.
    lines.push(`${digest}  ${asset}`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Emptied rather than written over, so a target removed from the table cannot
 * leave a stale binary behind for `gh release create` to pick up. A release
 * carrying a sixth asset nobody compiled is worse than one that failed.
 */
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

for (const entry of TARGETS) {
  console.log(`${entry.target} -> dist/${entry.asset}`)
  await compile(entry)
}

await writeFile(join(OUT, CHECKSUMS), await checksums())

const written = (await readdir(OUT)).sort()
console.log(`\njukebox ${pkg.version}: ${written.length} files in dist/`)
for (const name of written) console.log(`  ${name}`)
