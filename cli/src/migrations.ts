import type { PlaylistId } from '@jukebox/schema'

/**
 * The Mirror's schema, one step at a time.
 *
 * `CONTEXT.md`'s Mirror: the client's local record of the Playlists a user
 * tracks and the Tracks in them. Authoritative for local state only -- it can
 * always be rebuilt from a server snapshot -- but authoritative for that, which
 * is why it is not a cache and why its shape is versioned from the first
 * release. By the time the shape needs to change, people have one.
 *
 * The SQL is here rather than in `.sql` files beside the worker's, and it is the
 * distribution that decides that: the CLI ships as a single compiled binary,
 * which has no directory to read migrations out of. So the statements travel as
 * text in the binary, and the reasoning travels with them the way
 * `worker/migrations/*.sql` established -- a migration is the one artefact whose
 * comments outlive every reader of the commit that added it.
 */

/**
 * One step, and the version the Mirror is at once it has run.
 *
 * `sql` may hold several statements; the runner executes them together and in
 * one transaction, so a step is all-or-nothing.
 */
export type Migration = { version: number; sql: string }

/**
 * In order, and append-only. A step that has shipped is never edited, because
 * somebody's Mirror has already run it and would not run it again.
 *
 * Two steps rather than one, split where the worker split its own -- Playlists
 * in the first, Tracks in the second. It is deliberate: a migration runner that
 * has never once upgraded anything is a runner you find out is broken on the day
 * you need it, which is the argument #33 made for the version gate and it is the
 * same argument here. Splitting on the line the worker already split on means a
 * Mirror written at version 1 is a real earlier state a test can open.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      -- What version of this schema the Mirror in front of you is at.
      --
      -- A table rather than \`PRAGMA user_version\`, which would do the same job
      -- in no space at all. The Mirror is the user's own file and the one thing
      -- they can lose, so someone opening it with any SQLite browser should be
      -- able to see what it is without knowing to look in a header. The CHECK
      -- keeps it to the one row it means.
      CREATE TABLE schema_version (
        id      INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );

      -- A Playlist this user tracks.
      --
      -- Client-side "tracked" and server-side "tracked" are two different
      -- things, and this table is the client's: a Playlist can be tracked
      -- upstream because a stranger added it and be absent from every Mirror
      -- but theirs.
      CREATE TABLE playlists (
        id             TEXT PRIMARY KEY,  -- ADR-0001: Source name and Source id, colon-joined
        url            TEXT NOT NULL,
        title          TEXT,              -- NULL where the Source offers nothing usable
        folder_name    TEXT UNIQUE,       -- ADR-0004; NULL until a title is known
        status         TEXT NOT NULL,     -- pending | ok | gone | unreachable
        last_version   INTEGER,           -- the Version, which is also the ETag
        skipped        INTEGER,
        last_synced_at INTEGER
      );

      -- \`folder_name\` is UNIQUE because ADR-0004 says two Playlists whose titles
      -- sanitize to the same string get a numeric suffix. Written as a
      -- constraint rather than left to the call site that computes the suffix,
      -- so the day a second call site computes one it collides here instead of
      -- silently pointing two Playlists at one folder of the user's files.
      -- SQLite allows many NULLs under UNIQUE, which is what lets every Playlist
      -- still Pending have no folder name yet.

      -- No column for a Library path. ADR-0004 gives every Playlist a folder
      -- inside one root the user chooses, so the root is configuration and the
      -- folder is this name -- a per-Playlist absolute path would be a second
      -- answer to the same question, wrong the moment the root moves.
    `,
  },
  {
    version: 2,
    sql: `
      -- A Track in a Playlist, as its Source describes it. Metadata, never a
      -- file.
      --
      -- \`track_id\` is ADR-0001's namespaced form, derived on write. The API sends
      -- the Source's own id bare and carries no Source field of its own, so the
      -- Source comes from the Playlist's id -- which that ADR already covers the
      -- client's database with explicitly, so storing the bare id would
      -- contradict a recorded decision in order to save a string operation.
      --
      -- \`position\` is the Source's own index, kept as it is, so entries that
      -- were Skipped leave visible gaps rather than renumbering what follows.
      --
      -- \`artists\` is a JSON array because the contract's is always an array,
      -- including for one artist, and a joined string cannot be taken apart again
      -- without guessing where the separator was part of a name.
      --
      -- A Track that leaves is Removed, not deleted: its row stays and gains the
      -- moment it left. Without that the CLI has no way to report that anything
      -- happened -- it would print one count and then another and leave the user
      -- to do the diffing -- and once Fetching exists it is what stops a deleted
      -- row orphaning a downloaded file.
      --
      -- One row per Track per Playlist, ever, which is what the primary key says.
      -- A Track that leaves and comes back reuses its row and keeps the
      -- \`added_at\` it first joined at: the row is that Track's whole history
      -- here, and there is one of them.
      --
      -- Membership and file lifecycle are separate axes, which is why there is no
      -- state column. DESIGN section 02 puts both in one, and so needs a value
      -- meaning "removed upstream, file kept". Membership is the server's truth
      -- and exists today; file lifecycle is the client's and does not. Keeping
      -- them apart means Fetching adds a column rather than renegotiating a
      -- vocabulary everyone's Mirror is already written in.
      --
      -- Absent for the reason \`normalized_key\` was absent from the worker's
      -- second migration -- a column nothing computes is the same mistake as a
      -- table nothing fills: match, checksum, byte count, download timestamp.
      -- Nothing in this release can produce one. So is the events log DESIGN
      -- section 02 describes: its stated jobs are making Sync resumable and
      -- Reconcile explainable, and neither exists yet.
      --
      -- \`file path\` used to be fifth on that list and is a column now, added by
      -- step 3 below, which argues it there. The rule above is unchanged and the
      -- four that remain are still refused by it; step 3 is an exception taken
      -- knowingly, not a discovery that the rule was wrong.
      --
      -- Editing a shipped step, which the note on \`MIGRATIONS\` forbids. Allowed
      -- here and nowhere else: this is a comment, so a Mirror that ran the old
      -- text and one that runs this are the same Mirror. The alternative was
      -- leaving a sentence that names a column the next table over now has.
      CREATE TABLE tracks (
        playlist_id     TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        track_id        TEXT NOT NULL,     -- ADR-0001, derived on write
        title           TEXT NOT NULL,
        artists         TEXT NOT NULL,     -- JSON array; always an array
        album           TEXT,
        duration_ms     INTEGER,
        isrc            TEXT,
        cover_image_url TEXT,
        position        INTEGER NOT NULL,
        added_at        INTEGER NOT NULL,
        removed_at      INTEGER,           -- NULL = present
        PRIMARY KEY (playlist_id, track_id)
      );

      -- One Playlist's current Tracks, without reading the ones that have left.
      -- That is the read applying a snapshot already makes, before it writes
      -- anything, on a table a single pasted Playlist can put ten thousand rows in.
      --
      -- Ordered by position because the Source's own order is the order this is
      -- ever wanted in, so the index that answers the membership question answers
      -- the ordering one too rather than being a second index beside it.
      CREATE INDEX tracks_present ON tracks (playlist_id, position) WHERE removed_at IS NULL;
    `,
  },
  {
    version: 3,
    sql: `
      -- Where a Track's audio went, once something puts it there.
      --
      -- This is the column step 2 refuses by name, and it ships anyway. Both
      -- halves of that are deliberate and this is the whole of the argument.
      --
      -- The rule step 2 states is right and is not being repealed: a column
      -- nothing computes is a promise the schema makes on the code's behalf, and
      -- match, checksum, byte count and download timestamp are all still refused
      -- by it. What makes this one different is that it is NULL in every row this
      -- binary can write, and stays NULL -- so unlike those four it cannot ever
      -- disagree with anything. There is no state to be wrong about. A reader
      -- who queries it gets NULL and learns exactly what is true.
      --
      -- What it buys, immediately, is the thing the note on \`MIGRATIONS\` says
      -- version 1 bought: a runner that has upgraded something. Splitting 1 from
      -- 2 gave the tests one real earlier state to open; this gives them a
      -- second, and it is the first that is an ALTER rather than a fresh CREATE
      -- -- a different code path, on the Mirror somebody already has.
      --
      -- What it does NOT do is answer whether a Track's file is there. Nothing
      -- writes this, so today \`jukebox open\` reads the Playlist's folder and the
      -- folder is the whole answer. That stays true after Fetching writes here:
      -- a path records where a file was put, and only the filesystem knows
      -- whether it is still there. A user who moves or deletes their own audio
      -- tells this column nothing.
      --
      -- A NAME, never an absolute path. Step 1 refuses a per-Playlist absolute
      -- path in as many words -- "a second answer to the same question, wrong the
      -- moment the root moves" -- and a per-Track one is the same mistake with
      -- more rows. Three columns spell one path and each says its own part:
      -- \`library_path\` in the config file is the root, \`playlists.folder_name\`
      -- is the directory, this is the leaf. The name reads like an absolute path
      -- and is not, which is why it is said here.
      ALTER TABLE tracks ADD COLUMN file_path TEXT;
    `,
  },
]

/** The version a Mirror this binary created is at. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version

/**
 * A `tracks` row, once every step above has run.
 *
 * Here rather than in `tracking.ts` or `reading.ts` because neither of those
 * authors it. `MirrorStatus` lives beside its writes because `tracking.ts` is the
 * only thing that can invent one of those four strings; a column name is invented
 * by the `CREATE TABLE` above and merely quoted by both halves, so declaring it in
 * one of them would make the other import the shape of its own table from a peer.
 *
 * The forcing function is the other half of the reason. Whoever adds a column is
 * editing this file, and a declaration in this file is one they cannot miss.
 * `SCHEMA_VERSION` puts a fact about the shipped schema in this same place, but
 * it is a weaker precedent than it looks: that one is computed from the steps
 * and this one is written by hand, which is exactly the gap the check covers.
 */
export type TrackRow = {
  playlist_id: PlaylistId
  track_id: string
  title: string
  /** JSON array, always an array. `reading.ts` parses it. */
  artists: string
  album: string | null
  duration_ms: number | null
  isrc: string | null
  cover_image_url: string | null
  position: number
  added_at: number
  removed_at: number | null
  /**
   * The file's name inside the Playlist's folder, and NULL in every row this
   * binary writes. Step 3 argues both. Not an absolute path -- the root is
   * `library_path` and the directory is `playlists.folder_name`.
   *
   * Last, and that is load-bearing rather than tidy: `ADD COLUMN` appends at the
   * end of `pragma_table_info` order, so a Mirror upgraded to 3 and one built
   * fresh at 3 agree only if this stays after `removed_at`.
   */
  file_path: string | null
}

/** `true` where the column may hold NULL, which is `TrackRow`'s own answer read back. */
type NullableByColumn = { [C in keyof TrackRow]: null extends TrackRow[C] ? true : false }

/**
 * The same twelve columns the steps above declare, said a second time.
 *
 * **This is a second statement of one fact. It generates nothing and is generated
 * from nothing, and what makes that safe is that the two are compared** -- by the
 * `pragma_table_info` check in `mirror.test.ts`, against a Mirror the migrations
 * actually built. Anybody reading this and reaching for the obvious tidy-up
 * should stop there: the step above cannot be generated from this, because a step
 * that has shipped is never edited and this declaration moves every time the
 * table does.
 *
 * An object rather than a list of names, and the mapped type is the point. Every
 * key of `TrackRow` must appear, exactly once, with the nullability `TrackRow`
 * already gives it -- so a column added to the type and forgotten here will not
 * compile. A `readonly string[]` with `satisfies` would only check the other
 * direction, and the column nobody wired up is precisely the one that reads back
 * `undefined`.
 *
 * Names and their order are most of the job. Nullability is here because it is
 * the part nothing else is guaranteed to hold. SQLite resolves names when a
 * statement is prepared, which is coverage rather than a typecheck; and `tsc`
 * objects to a nullability lie only where the value bound into the column is
 * itself nullable. That happens to cover all six today, because `tracking.ts`
 * binds `album`, `isrc`, `duration_ms` and `cover_image_url` straight off the
 * snapshot and both `removed_at` and `file_path` as literal nulls. It stops
 * covering the first
 * column the table lets hold NULL that this CLI always writes a value into --
 * which is the one a read would go on promising until the row without it
 * arrives.
 *
 * Affinity is not held here. TEXT declared where the table says INTEGER is the
 * drift this does not see, and the check below should not be read for more
 * than it asserts: the names, their order, and which of them may be NULL.
 */
export const TRACK_COLUMN_MAY_BE_NULL: NullableByColumn = {
  playlist_id: false,
  track_id: false,
  title: false,
  artists: false,
  album: true,
  duration_ms: true,
  isrc: true,
  cover_image_url: true,
  position: false,
  added_at: false,
  removed_at: true,
  file_path: true,
}

/**
 * The column names, in the table's own order.
 *
 * Insertion order of the object above, which is the order the `CREATE TABLE`
 * declares and the order the check asserts -- so a projection built from this
 * lines up with `pragma_table_info` without anybody sorting anything. The cast is
 * what `Object.keys` always needs; the mapped type is what makes it true.
 */
export const TRACK_COLUMN_NAMES = Object.keys(TRACK_COLUMN_MAY_BE_NULL) as (keyof TrackRow)[]
