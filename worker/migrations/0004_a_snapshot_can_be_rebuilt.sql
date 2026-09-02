-- What a snapshot needs in D1 that D1 did not hold, so one can be rebuilt.
--
-- A snapshot is `{ version, title, skipped, tracks }`. `version` and `title`
-- were already on this row and the Tracks are in `playlist_tracks`, so the
-- rebuild issue #25 asks for was two facts short.

-- How many entries the Source offered that never became Tracks. It lived only
-- inside the KV document, so a rebuild had to either invent it or drop it -- and
-- dropping it breaks the reason it exists: a list shorter than the Source's
-- would read as data loss.
--
-- Nullable, and not backfilled. NULL says something true of the rows already
-- here -- resolved before this column existed, or not resolved at all -- and it
-- is the one case the rebuild refuses rather than answering with a number
-- nobody counted. A `DEFAULT 0` would be exactly the invented value 0001 left
-- `refresh_interval_s` blank to avoid.
ALTER TABLE playlists ADD COLUMN skipped INTEGER;

-- The Version the rows in `playlist_tracks` currently reflect.
--
-- Not the same as `version`, and the difference is the whole point of the
-- column. `version` is the Version that has been *acknowledged*; this is the
-- Version the membership was last written for. A Resolution writes membership
-- first, so the two come apart whenever an attempt died after that write and
-- before the rest: the rows are a Version ahead of everything describing them.
-- A rebuild that did not notice would serve one Version's Tracks under another
-- Version's title, count and number.
--
-- NULL means the rows reflect no Version anybody can name, and the rebuild
-- refuses. Two things reach it. A Playlist resolved before this migration is
-- one. The other is a Playlist whose Source offered the same recording twice:
-- 0003 made a Track present in a Playlist at most once, deliberately and for
-- this same rebuild's sake, so a duplicate entry is one the membership cannot
-- represent -- and a rebuild is then a shorter list than the Source's, which is
-- the exact thing `skipped` above exists to stop being invisible.
ALTER TABLE playlists ADD COLUMN membership_version INTEGER;

-- What this migration also unblocks, recorded here because 0003 said the
-- opposite and is applied history that will not be edited.
--
-- 0003 closed by saying that making membership current -- soft-deleting a Track
-- that left, re-placing one that moved -- was Refresh's work, on the grounds
-- that "nothing reads these rows and nothing rebuilds a snapshot from them".
-- #25 is what makes something read them, so that ground is gone. `recordTracks`
-- now writes membership current, in the same commit as the rebuild that reads
-- it. See docs/adr/0008-membership-is-made-current-by-its-writer.md for what
-- that reverses and what is still Refresh's.
