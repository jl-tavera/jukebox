-- A tracked playlist, identified by its public URL on a Source.
--
-- `id` is the Source name and the Source's own id joined by a colon --
-- `spotify:37i9dQZF1DXcBWIGoYBM5M`. This deviates from DESIGN 02's "internal id,
-- not the source's" and is recorded in docs/adr/0001-namespaced-playlist-ids.md.
-- Being deterministic is what makes POST /playlists idempotent without a lookup.
CREATE TABLE playlists (
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL,        -- spotify | apple | youtube
  source_id          TEXT NOT NULL,        -- id within that Source
  url                TEXT NOT NULL,
  title              TEXT,
  owner              TEXT,
  source_revision    TEXT,                 -- opaque did-it-change probe; see DESIGN 03
  version            INTEGER NOT NULL,     -- monotonic; the ETag
  refresh_interval_s INTEGER NOT NULL,
  last_refreshed_at  INTEGER,
  status             TEXT NOT NULL,        -- pending | ok | unreachable | gone
  UNIQUE (source, source_id)
);
