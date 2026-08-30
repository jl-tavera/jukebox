import pkg from '../package.json'

/**
 * What this binary is.
 *
 * Read from the package the release is cut from, so `--version`, the JSON
 * envelope and the tag a release carries cannot disagree. It is inlined at
 * build time, which is what lets a compiled single-file binary answer at all.
 */
export const VERSION: string = pkg.version

/**
 * Said in `--help`, in `--help --json`, and in the README.
 *
 * An agent reading this output is exactly who would otherwise build on a shape
 * that is going to move. Recorded in docs/adr/0005.
 */
export const JSON_STABILITY =
  'The JSON shape is unstable before 1.0 and may change in any release. It freezes at 1.0.'

/** `major.minor.patch`, and nothing else. The same grammar the schema publishes under. */
const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * Whether this binary predates the oldest one the backend will serve.
 *
 * Numeric, field by field, and that is the only reason it exists: `"0.10.0"`
 * sorts before `"0.9.0"` as text, so a string comparison refuses every
 * installed binary on the day the minor version reaches ten, and does it to
 * everybody at once.
 *
 * **A version either side cannot read means the gate does not fire.** That is
 * fail-open, deliberately, and only on this input. A `min_version` of `latest`
 * or `0.1` is a typo in a hand-edited file, and a client that bricked itself
 * over one is the exact failure `docs/design/DESIGN.md` section 07's
 * breaking-change procedure exists to prevent -- by the time it is noticed
 * there is no channel left to reach the people running it. The publish-time
 * check in `schema/` is what catches the typo, and it runs before anyone reads
 * the file.
 *
 * The cost of that choice is that a release numbered outside this shape --
 * `0.2.0-rc.1` -- silently turns the gate off, which is precisely the "gate you
 * discover is broken on the day you need it" this ticket exists to avoid. So a
 * test asserts `VERSION` itself is readable, and the day it stops being is the
 * day CI says so rather than the day the API moves.
 */
export const olderThan = (version: string, minimum: string): boolean => {
  const mine = fields(version)
  const theirs = fields(minimum)
  if (mine === undefined || theirs === undefined) return false

  for (let i = 0; i < mine.length; i++) {
    // Major before minor before patch, and returning on the first field that
    // differs is what gives them their weight: a larger patch cannot rescue a
    // smaller major.
    if (mine[i]! !== theirs[i]!) return mine[i]! < theirs[i]!
  }

  return false
}

/**
 * The three numbers, or nothing at all.
 *
 * Read with a pattern rather than by splitting and calling `Number`, which
 * would accept ` 1.0.0`, `+1.0.0` and `1.0.0 ` -- none of them a release, and
 * each one a document this binary would then act on.
 */
const fields = (release: string): [number, number, number] | undefined => {
  const found = RELEASE.exec(release)
  if (found === null) return undefined

  return [Number(found[1]), Number(found[2]), Number(found[3])]
}
