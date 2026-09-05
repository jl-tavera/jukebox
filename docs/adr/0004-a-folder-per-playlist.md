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

## Amendment, 2026-08-31: `library_path` becomes real

This ADR said the decision "reaches the code only as `library_path` in the config file". #34 is
where that file came to exist, and settling it required four choices this ADR named only in
passing. Each is recorded because it is the kind of thing a later reader would otherwise decide
again, differently.

- **The file is TOML, in the platform's configuration directory**, separate from the data directory
  holding the Mirror — spec #29's decision, on the grounds that configuration is hand-written and
  worth keeping while the Mirror is rebuildable. `Bun.TOML.parse` is built into the runtime, so this
  costs no dependency and nothing that would reintroduce a native module to the compiled binary.
  TOML's literal strings also take a Windows path without escaping it, which JSON cannot:
  `library_path = 'C:\Users\ada\Music\Jukebox'`.
- **The default is a `Jukebox` folder inside the platform's music directory** — `~/Music` on Windows
  and macOS, `$XDG_MUSIC_DIR` or `~/Music` on Linux. Titled on every platform, including the one
  where the CLI's own directory is lower-case: that casing is about fitting in among `~/.config`'s
  dotted neighbours, and this folder sits in a browsable music directory instead.
- **Windows' Known Folder is not read.** A user genuinely can move their Music folder and nothing in
  the environment says where to — only the registry. A registry read is a lot of platform-specific
  code for a default that nothing writes to in this release, and someone who moved theirs sets
  `library_path`. The same reasoning keeps Linux's answer to the environment rather than parsing
  `~/.config/user-dirs.dirs`: the resolver stays pure, which is what lets every platform's answer be
  checked from any platform.
- **`JUKEBOX_LIBRARY` overrides it; `JUKEBOX_HOME` deliberately does not.** The variable that
  relocates everything relocates everything *of ours*. The Library is the user's own folder and sits
  on the other side of that line — somebody pointing the CLI at a scratch directory has not asked
  for their music to move.

The consequence this ADR anticipated still holds and is now visible: **nothing creates the folder.**
`jukebox config` reports the path and says outright that no Library folder is created and nothing is
downloaded, because a user who sets a path and finds an empty folder has been misled by output that
was technically accurate.

## Amendment, 2026-09-01: the file becomes writable

The amendment above settled how `library_path` is read. #53 settles how it is written: `jukebox
config` takes two optional positional arguments, so a setting can be changed without hand-editing
TOML. Four more choices, each recorded for the reason the last four were -- a later reader would
otherwise decide them again, differently.

- **Two positional arguments rather than a `config set` subcommand.** The command tree is one level
  deep, and `main` resolves a command name by looking the first non-flag token up in it exactly
  once. A nested subcommand would mean teaching that dispatch to recurse for the sake of one
  command. Spec #50 asked for `config set` by name; this is the shape that answer takes.
- **The file is rebuilt, not patched.** `Bun.TOML.parse` reads TOML and nothing in the runtime
  writes it, so a writer was needed either way. It emits the settings Jukebox understands and
  nothing else, which means comments do not survive a write -- the command says so, and only when
  the file had something to lose. Patching in place would need an editor that preserves tables,
  dotted keys and multi-line strings, which is a great deal of machinery for two keys.
- **A file that will not parse is never rewritten.** Its contents are opaque, so replacing it is
  unbounded destruction of something hand-written; a readable file's settings are all known, so the
  loss is bounded and can be named. That one refuses with `config_unwritable` and says to fix or
  delete the file first.
- **Only what the user chose is written down.** A default never goes in the file. It would come back
  as `(file)` for something nobody picked, and the defaults are machine-dependent -- this machine's
  `%APPDATA%` answer written into a file makes the file wrong on the next machine.

The consequence stays exactly as the previous amendment left it. **Nothing creates the folder**, and
setting `library_path` does not either: a write brings the configuration directory and the file into
existence, and nothing else.

## Amendment, 2026-09-05: the first thing to look in the folder

Every amendment above ends on the same note: **nothing creates the folder.** That is still true, and
#108 is the first thing that *reads* it. `jukebox open <playlist> <n>` takes a Track's number, works
out where its audio would be under this ADR's layout, and hands the file to whatever the machine
opens audio with. Six choices had to be made to do that, each recorded for the reason the previous
sixteen were — a later reader would otherwise decide them again, differently.

- **The file is found by looking, not by computing a name.** The obvious implementation builds
  `{nn} - {title}.{ext}` and asks whether it is there. That is DESIGN §11's template, it is still
  marked **Proposed**, and inheriting it by looking at it is precisely what this ADR already refused
  to do with `~2`. Worse, it would find nothing that a person put in the folder themselves — which,
  in a release that downloads nothing, is every file that exists. So the directory is read and a
  name is matched. Fetching stays free to settle any template it likes, and whatever it settles will
  already be found.
- **"Matches" means the filename holds the Track's title**, with the title put through the same
  character pass the folder name gets. That pass is now `folders.madeSafe`, exported rather than
  copied: a title with a slash in it cannot appear in a filename holding that slash, so comparing
  raw strings fails on exactly the titles nobody thinks to test. A name that *is* the title beats
  one that merely contains it, because a short title is a substring of every longer one and `Rain`
  would otherwise open `Rain and Shine`.
- **Only audio counts**, from a named list — `.flac`, `.mp3`, `.ogg`, `.opus`, `.m4a`, `.wav`. The
  folder is the user's own and holds cover art, playlist files and notes; opening a JPEG because its
  name matched is a worse answer than saying nothing is there. A `*.pid.part` never counts: that is
  `files.ts`'s write-then-rename in flight or dead, and half a file is not a thing to hand a player.
- **Two matches are resolved rather than refused**, first by sorted name, silently. This parts on
  purpose from `reading.ts`, which refuses an ambiguous Playlist and says so. That rule's stated
  reason is that a wrong answer to *which of these did you mean* is one the reader cannot notice, and
  it does not hold here: a player names what it opened, in a window, a second later. `remove` is
  where the strictness earns itself, and this is not `remove`.
- **A folder that is not there reads exactly like a folder with nothing in it.** In this release
  those are the same fact — you have not downloaded this — and `ENOENT` is not something a person
  needs told. The sentence names the folder it looked in and says outright that Jukebox fetches
  nothing yet, so an empty answer never reads as a download that failed.
- **`tracks.file_path` exists and is NULL in every row.** Migration 3 added it, knowingly, against a
  rule in that same file; it argues itself there. What matters here is that it is not what answers
  the question. The folder is, today and after Fetching writes to that column: a path records where a
  file was *put*, and only the filesystem knows whether it is still there. It also holds a name
  inside this ADR's folder rather than an absolute path, for the reason migration 1 gives for
  Playlists — the root moves, and a stored absolute path is wrong the moment it does.

DESIGN §11's template stays **Proposed**. Nothing here decides it, and this amendment is deliberately
written so that it need not.
