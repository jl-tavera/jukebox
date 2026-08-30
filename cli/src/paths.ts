import { homedir, platform } from 'node:os'
import { posix, win32 } from 'node:path'

/**
 * Where the CLI keeps things.
 *
 * Two directories rather than one, because they have different lifetimes and
 * different backup stories: configuration is written by a person and worth
 * keeping, and the Mirror can always be rebuilt from a server snapshot. Merging
 * them is the kind of decision that cannot be undone later without moving
 * everyone's database.
 */
export type Locations = {
  /** Holds the configuration file. */
  config: string
  /** Holds the Mirror. Nothing here creates it, or anything in it. */
  data: string
}

/**
 * Everything the answer depends on, handed in rather than read.
 *
 * The point is not testability for its own sake: it is that the answer for one
 * platform can be checked from another. Windows is this project's primary
 * environment and Linux is CI's, and a resolver that read `process` directly
 * would let each check only its own.
 */
export type Host = {
  platform: string
  env: Record<string, string | undefined>
  home: string
}

export const thisHost = (): Host => ({
  platform: platform(),
  env: process.env,
  home: homedir(),
})

/** One variable moves both directories. See the comment where it is read. */
export const HOME_VARIABLE = 'JUKEBOX_HOME'

/**
 * Capitalised where the platform's own directories are, lower-case where they
 * are not. Windows and macOS put readable names in browsable folders; Linux
 * puts short ones in dotted paths, and a `Jukebox` sitting in `~/.config`
 * beside `gh` and `nvim` would be the odd one out.
 */
const NAME = { titled: 'Jukebox', plain: 'jukebox' }

/**
 * The platform's own answer, or the one thing that overrides it.
 *
 * The layout follows the `env-paths` convention, which is what most CLIs that
 * bothered to ask this question landed on, and cligentic's `xdg-paths` block is
 * the same shape. Neither is installed: this needs two directories, and both
 * carry five or six the CLI has nothing to put in.
 */
export const locations = (host: Host = thisHost()): Locations => {
  // Resolved for a platform, not on one. A Windows path built with forward
  // slashes opens perfectly well and reads wrong in every message that prints
  // it, and `node:path`'s default is the host's spelling rather than the
  // target's.
  const join = host.platform === 'win32' ? win32.join : posix.join

  // One variable rather than two, because two can be set inconsistently and one
  // cannot -- and because a person relocating everything has one thing to
  // remember. Empty is not set: a blank value would otherwise put the Mirror at
  // the filesystem root.
  const relocated = host.env[HOME_VARIABLE]
  if (relocated) {
    return { config: join(relocated, 'config'), data: join(relocated, 'data') }
  }

  if (host.platform === 'win32') {
    // A stripped environment still has a home. Guessing the two standard
    // folders from it beats writing to the drive root or refusing to boot.
    const roaming = host.env.APPDATA || join(host.home, 'AppData', 'Roaming')
    const local = host.env.LOCALAPPDATA || join(host.home, 'AppData', 'Local')

    // Roaming follows a user between machines and Local does not, which is the
    // right side of that line for each: a setting is worth carrying, and a
    // rebuildable database is not worth the sync.
    return { config: join(roaming, NAME.titled), data: join(local, NAME.titled) }
  }

  if (host.platform === 'darwin') {
    return {
      config: join(host.home, 'Library', 'Preferences', NAME.titled),
      data: join(host.home, 'Library', 'Application Support', NAME.titled),
    }
  }

  // Linux, and anything else that is neither of the above: the XDG base
  // directory spec, whose own defaults are what these fall back to.
  return {
    config: join(host.env.XDG_CONFIG_HOME || join(host.home, '.config'), NAME.plain),
    data: join(host.env.XDG_DATA_HOME || join(host.home, '.local', 'share'), NAME.plain),
  }
}
