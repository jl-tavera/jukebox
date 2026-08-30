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
