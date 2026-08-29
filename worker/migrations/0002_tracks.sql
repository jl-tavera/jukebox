-- A Track as its Source describes it. Metadata, never a file.
--
-- `id` follows ADR-0001: the Source name and the Source's own id for the Track,
-- joined by a colon. Two Playlists holding the same Track therefore reach the
-- same row without a lookup deciding it.
--
-- Three deviations from DESIGN 02's DDL, each for the reason 0001 left
-- refresh_interval_s blank -- a column that says something untrue is worse than
-- one that is not there:
--
--   * `artists` is a JSON array, not DESIGN's singular `artist`. The normalized
--     Track carries artists as an array always, and DESIGN 02's own reason for
--     D1 is that KV can be rebuilt from it -- which a joined string cannot do.
--   * `cover_image_url` is here. CONTEXT.md's Track names a cover image and the
--     API carries one; DESIGN 02's table predates both.
--   * `normalized_key` is absent. It is DESIGN 04's Matching cache key, and
--     Matching does not exist. A column nothing computes is the same mistake as
--     a table nothing fills.
CREATE TABLE tracks (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,        -- spotify | apple | youtube | stub
  source_track_id TEXT NOT NULL,        -- id within that Source
  title           TEXT NOT NULL,
  artists         TEXT NOT NULL,        -- JSON array; always an array
  album           TEXT,
  duration_ms     INTEGER,
  isrc            TEXT,                 -- when the Source exposes one
  cover_image_url TEXT,
  UNIQUE (source, source_track_id)
);

-- Membership of a Playlist. Soft-deleted so history survives: a Track that
-- leaves a Playlist keeps its row and gains a `removed_at`.
--
-- `position` is the Source's own index, kept as it is, so entries the Source
-- offered that are not Tracks leave visible gaps rather than renumbering what
-- follows them.
--
-- Nothing sets `removed_at` yet, because nothing re-resolves a Playlist. It is
-- not the mistake `normalized_key` would have been: NULL is a value this column
-- genuinely has, and it says something true today -- every membership recorded
-- so far is current. A NOT NULL column would have needed an answer invented for
-- it instead.
CREATE TABLE playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id),
  track_id    TEXT NOT NULL REFERENCES tracks(id),
  position    INTEGER NOT NULL,
  added_at    INTEGER NOT NULL,
  removed_at  INTEGER,                  -- NULL = currently present
  PRIMARY KEY (playlist_id, track_id, added_at)
);
