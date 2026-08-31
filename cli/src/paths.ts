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
  /**
   * Holds the last discovery document seen, and will hold the Mirror.
   *
   * Both are rebuildable, which is what puts them on this side of the line:
   * the saved document is refetched within the hour and the Mirror can always
   * be rebuilt from a server snapshot. Nothing creates the Mirror yet -- #35 is
   * where it comes into existence, because it is the first thing that needs one.
   */
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
 * A variable's value, or nothing at all.
 *
 * **Blank is not set, and whitespace is blank.** Every variable this project
 * reads follows that rule -- `JUKEBOX_HOME`, `JUKEBOX_API`, and the two `config`
 * adds -- because a blank value read as a value is uniformly a disaster in
 * miniature: a Mirror at the filesystem root, an API address of nothing, a
 * Library in `/Jukebox`.
 *
 * Written once here because it had been written three times and the three had
 * drifted: two used `||`, which lets a single space through as a path, and one
 * trimmed. Every one of them carried a comment claiming to follow the same rule,
 * which is how the divergence survived. `phrasing.ts` is the precedent for
 * moving a shared sentence somewhere both callers can reach.
 */
export const given = (env: Host['env'], name: string): string | undefined => {
  const value = env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/**
 * Capitalised where the platform's own directories are, lower-case where they
 * are not. Windows and macOS put readable names in browsable folders; Linux
 * puts short ones in dotted paths, and a `Jukebox` sitting in `~/.config`
 * beside `gh` and `nvim` would be the odd one out.
 */
const NAME = { titled: 'Jukebox', plain: 'jukebox' }

/**
 * Resolved for a platform, not on one.
 *
 * A Windows path built with forward slashes opens perfectly well and reads
 * wrong in every message that prints it, and `node:path`'s default is the
 * host's spelling rather than the target's. Shared by both resolvers below, so
 * that a second one cannot quietly answer in the running machine's dialect.
 */
const joiner = (host: Host) => (host.platform === 'win32' ? win32.join : posix.join)

/**
 * The platform's own answer, or the one thing that overrides it.
 *
 * The layout follows the `env-paths` convention, which is what most CLIs that
 * bothered to ask this question landed on, and cligentic's `xdg-paths` block is
 * the same shape. Neither is installed: this needs two directories, and both
 * carry five or six the CLI has nothing to put in.
 */
export const locations = (host: Host = thisHost()): Locations => {
  const join = joiner(host)

  // One variable rather than two, because two can be set inconsistently and one
  // cannot -- and because a person relocating everything has one thing to
  // remember. Blank is not set, per `given`.
  const relocated = given(host.env, HOME_VARIABLE)
  if (relocated !== undefined) {
    return { config: join(relocated, 'config'), data: join(relocated, 'data') }
  }

  if (host.platform === 'win32') {
    // A stripped environment still has a home. Guessing the two standard
    // folders from it beats writing to the drive root or refusing to boot.
    const roaming = given(host.env, 'APPDATA') ?? join(host.home, 'AppData', 'Roaming')
    const local = given(host.env, 'LOCALAPPDATA') ?? join(host.home, 'AppData', 'Local')

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
    config: join(given(host.env, 'XDG_CONFIG_HOME') ?? join(host.home, '.config'), NAME.plain),
    data: join(
      given(host.env, 'XDG_DATA_HOME') ?? join(host.home, '.local', 'share'),
      NAME.plain,
    ),
  }
}

/** The one variable that moves the Library's default. Read only where XDG applies. */
export const MUSIC_VARIABLE = 'XDG_MUSIC_DIR'

/**
 * Where the user keeps music.
 *
 * Deliberately not a member of `Locations`, and the line is ownership rather
 * than tidiness. Everything in `Locations` is ours: we create it, we write to
 * it, and `JUKEBOX_HOME` may move all of it at once. This is the user's own
 * folder, which is why that variable does not reach it -- someone pointing the
 * CLI at a scratch directory has not asked for their music to move.
 */
export const musicDirectory = (host: Host): string => {
  const join = joiner(host)

  // Windows and macOS both put it at `Music` under the profile. Windows calls
  // it a Known Folder and a user genuinely can move it, but nothing in the
  // environment says where to -- only the registry, and a registry read is a
  // lot of platform-specific code for a default that nothing writes to in this
  // release. A user who moved theirs sets `library_path` instead.
  if (host.platform === 'win32' || host.platform === 'darwin') return join(host.home, 'Music')

  // Linux, where XDG does name it. Read from the environment only: the spec's
  // own home for this is `~/.config/user-dirs.dirs`, and parsing that would
  // cost this resolver the purity that lets every platform's answer be checked
  // from any platform -- which is the whole reason a `Host` is handed in.
  //
  // Blank is not set, per `given`. A blank value read as a path would put
  // someone's Library in `/Jukebox`.
  return given(host.env, MUSIC_VARIABLE) ?? join(host.home, 'Music')
}

/**
 * The Library's root, unless the user says otherwise. ADR-0004 governs what
 * goes inside it; nothing creates it, here or anywhere else in this release.
 *
 * Titled on every platform, including the one where `locations` goes
 * lower-case. That casing is about fitting in among `~/.config`'s dotted
 * neighbours, and this folder has no such neighbours: it sits in a browsable
 * music directory beside albums named the way a person would name them.
 */
export const defaultLibrary = (host: Host): string =>
  joiner(host)(musicDirectory(host), NAME.titled)
