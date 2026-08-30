# A folder per Playlist, and duplicate files between them

The Library is one root the user chooses, and every Playlist gets a folder inside it named
after the Playlist. A recording in three Playlists is therefore downloaded three times and
stored three times. We accept that.

`docs/design/DESIGN.md` §11 lists "Cross-playlist deduplication" as an open question — three
copies, hardlinks, symlinks, or a content-addressed store with links — and notes that
filesystem portability makes it genuinely hard on Windows, which §06 names as this project's
primary environment. A flat root would have closed that question by never opening it: under
`{artist}/{album}/{title}` the same recording resolves to the same path, and there is nothing
to deduplicate. We chose the layout that opens it anyway, because a folder per Playlist is
what makes the Library browsable as the thing the user actually asked for.

Nothing creates these folders yet. Fetching does not exist, so this decision reaches the code
only as `library_path` in the config file. It is recorded now because the layout is what that
setting means, and because it is the kind of decision that is expensive to revisit once
someone has a Library arranged by it.

## Considered options

**A flat root, no per-playlist folders.** One file per recording, the dedup question closed,
no Windows link problem. Rejected because the Library then has no structure corresponding to
the Playlists that produced it, and mirroring Playlists is the whole product.

**Per-playlist folders over hardlinks or a content-addressed store.** Keeps both properties.
Rejected for now: hardlinks fail across volumes, symlinks need elevation on some Windows
configurations, and both confuse tools that copy or back up a folder. Real work, for a saving
measured in megabytes.

## Consequences

Disk use scales with Playlist membership rather than with distinct recordings, and so does
bandwidth — each copy is its own download from the Catalog. Someone tracking ten overlapping
Playlists pays for the overlap twice.

A Playlist renamed on its Source does not rename its folder. The folder keeps the name it was
created with, recorded in the Mirror, because renaming a directory of the user's files in
response to a remote change is exactly what the rule against destroying local files exists to
prevent. The cost is a folder name that can drift from the Playlist's current title.

Folder names are sanitized — the characters Windows forbids, trailing dots and spaces, and
reserved device names like `CON`. Two Playlists whose titles sanitize to the same string get a
numeric suffix.
