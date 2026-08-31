import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { MIGRATIONS, SCHEMA_VERSION } from './migrations'
import { locations } from './paths'

/**
 * The Mirror: opened, brought up to date, and handed over.
 *
 * `bun:sqlite` because it is built into the runtime -- no native module, no
 * install-time compilation, and it bundles into the standalone binary. That is
 * the whole reason `CLAUDE.md` picked Bun, and it is why nothing here may reach
 * for a SQLite package that reintroduces a compile step.
 *
 * It lives in the data directory rather than the config one. Configuration is
 * hand-written and worth keeping; the Mirror is rebuildable from a server
 * snapshot, and `paths.ts` splits them for exactly that difference in lifetime.
 */

/** The file, in the data directory beside the last discovery document seen. */
export const MIRROR_FILE = 'mirror.sqlite'

/**
 * An open Mirror. The `bun:sqlite` handle itself, deliberately not wrapped.
 *
 * A wrapper would have to grow a method per statement anything wants, and every
 * one of those methods would be a place for a query to hide from the module that
 * owns the table. `tracking.ts` owns the writes and `reading.ts` owns the reads;
 * both take one of these.
 */
export type Mirror = Database

/**
 * The Mirror could not be opened, or could not be brought up to date.
 *
 * Thrown rather than swallowed, which is the opposite of what `cache.ts` does
 * with a write it cannot make -- and the difference is that the cache is
 * discardable by construction. A cache that can break a working command is worse
 * than no cache; a Mirror that cannot be opened is the command.
 */
export class MirrorUnopenable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MirrorUnopenable'
  }
}

/**
 * Where the Mirror is. Read through `locations` on every call rather than
 * captured, because the tests relocate a whole home between runs and a captured
 * path would be the previous one's.
 */
export const mirrorPath = (): string => join(locations().data, MIRROR_FILE)

/**
 * Runs `work` against an open, up-to-date Mirror, and closes it afterwards
 * whether or not the work succeeded.
 *
 * The close is not housekeeping. An open handle keeps a lock on the file, and a
 * test that cannot delete its temporary home leaves it on the developer's disk
 * -- on Windows, which is the machine this is developed on and the one the tests
 * run on there.
 */
export const withMirror = async <T>(work: (mirror: Mirror) => Promise<T> | T): Promise<T> => {
  const mirror = openMirror()

  try {
    return await work(mirror)
  } finally {
    release(mirror)
  }
}

/**
 * Closed, and actually let go of.
 *
 * `close(true)` rather than `close()`, and the difference is not error
 * reporting. A handle with a statement still cached against it -- which is every
 * one of these, because `query` caches what it prepares -- answers SQLITE_BUSY,
 * and the plain close swallows that and leaves the file open until the handle is
 * garbage collected. That is precisely the lock the comment above says this
 * close exists to prevent, so the plain close was not doing the job it was
 * written for.
 *
 * Swallowed because this runs on the way out of a failure as well as a success,
 * and a cleanup that threw would replace whatever was already being reported
 * with something less useful.
 */
const release = (mirror: Mirror): void => {
  try {
    mirror.close(true)
  } catch {
    // Deliberately nothing. See above.
  }
}

const openMirror = (): Mirror => {
  const path = mirrorPath()

  let mirror: Mirror
  try {
    // The data directory may not exist: nothing before this ticket created one
    // unless a discovery document had already been saved into it.
    mkdirSync(locations().data, { recursive: true })
    mirror = new Database(path, { create: true, strict: true })
  } catch (error) {
    throw new MirrorUnopenable(
      `Jukebox could not open its local record at ${path}: ${because(error)}`,
    )
  }

  try {
    // Off by default in SQLite, and the Mirror has one foreign key that matters:
    // deleting a Playlist has to take its Tracks with it, which is what
    // `remove` will be. Set before any statement runs, because a pragma cannot
    // be changed inside a transaction.
    mirror.exec('PRAGMA foreign_keys = ON')
    migrate(mirror)
  } catch (error) {
    release(mirror)

    if (error instanceof MirrorUnopenable) throw error
    throw new MirrorUnopenable(
      `Jukebox could not bring its local record at ${path} up to date: ${because(error)}`,
    )
  }

  return mirror
}

const because = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Brings a Mirror from whatever version it is at to this binary's.
 *
 * Each step in its own transaction, so a step that fails leaves every earlier
 * one recorded and the next run resumes rather than starting over -- and so that
 * a step which fails half way leaves nothing of itself behind.
 *
 * Applying nothing is the ordinary case: almost every run opens a Mirror already
 * at this version, and the whole cost of that is one read of one row.
 */
const migrate = (mirror: Mirror): void => {
  const at = versionOf(mirror)

  // A Mirror written by a newer Jukebox. Stopping is the same decision the
  // discovery document's `min_version` gate makes in the other direction: a
  // binary that does not understand the shape in front of it should say so
  // rather than read it as though it did, because a column this one has never
  // heard of is one it would drop on the next write.
  if (at > SCHEMA_VERSION) {
    throw new MirrorUnopenable(
      `The local record at ${mirrorPath()} was written by a newer Jukebox ` +
        `(its schema is version ${at}, and this copy knows version ${SCHEMA_VERSION}). ` +
        'Upgrade to the latest release and run this again.',
    )
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= at) continue

    mirror.transaction(() => {
      mirror.exec(migration.sql)
      mirror.run(
        `INSERT INTO schema_version (id, version) VALUES (1, ?)
         ON CONFLICT (id) DO UPDATE SET version = excluded.version`,
        [migration.version],
      )
    })()
  }
}

/**
 * The version a Mirror is at, and 0 for one that has never been written to.
 *
 * The table is looked for rather than the read attempted and caught, because a
 * missing table and a table that cannot be read are different problems and only
 * one of them is "this file is new".
 */
const versionOf = (mirror: Mirror): number => {
  const table = mirror
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'`,
    )
    .get()

  if (table === null) return 0

  const row = mirror
    .query<{ version: number }, []>('SELECT version FROM schema_version WHERE id = 1')
    .get()

  return row?.version ?? 0
}
