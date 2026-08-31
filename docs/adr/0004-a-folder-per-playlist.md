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

## Amendment, 2026-08-31: the mechanics, chosen at first use

#35 computed the first folder name, and the four things this ADR named only by category had to
be decided to do it. Recorded here because each is the kind of choice a later reader would
otherwise make again, differently, and because two of them are consequences this ADR did not
mention at all.

- **Forbidden characters are dropped, not replaced.** `Rain / Shine` becomes `Rain Shine`, and the
  whitespace the removal leaves behind collapses. A title arrives as prose, and `Rain _ Shine` is a
  name nobody wrote and nobody looking for the Playlist would type.
- **A reserved device name keeps its title and gains ` (device)`.** `CON` becomes `CON (device)`,
  and so does `CON.txt`, because the reservation covers a name with an extension too. Suffixed
  rather than dropped or replaced by the id, so somebody whose Playlist really is called `CON` can
  still find the folder it made.
- **The numeric suffix is ` (2)`, ` (3)`.** What Windows itself does with a duplicate. Deliberately
  not `~2`: that is DESIGN §11's sketch for a colliding *track filename*, it is still marked
  Proposed, and inheriting it here by looking at it would tie two undecided things together.
- **Names are capped at 100 characters, cut at a word.** Not in this ADR, and it follows from it:
  the folder holds a `{nn} - {title}.{ext}` file inside a root the user chose, and it is the whole
  path that has a limit. Both suffixes are added *after* the cut and may carry the result a few
  characters past it, because shortening the name to make room would change the thing the suffix
  exists to distinguish. The order matters more than it looks: a reserved *stem* is four characters
  but a reserved *name* is any length, so checking for a device before cutting let `CON.` and two
  hundred more past the cap entirely.
- **A name with nothing left of it falls back to the Playlist's id**, with the colon ADR-0001 joins
  it with replaced by a hyphen. This is the case a Playlist whose Source offers no usable title
  lands in, and `CONTEXT.md` forbids the alternative: a title is absent rather than a placeholder,
  "which nobody downstream could tell from a real title".

One consequence of the rename rule above, now that a Playlist can be tracked before it is read: the
name is computed at the first moment there is a title to compute it from, and stored `NULL` until
then. That is during `add` when the Resolution lands inside its wait, and the first Sync otherwise.
Naming a folder after the id at add time would have been naming it after the id for ever, because
this ADR forbids changing it afterwards.
