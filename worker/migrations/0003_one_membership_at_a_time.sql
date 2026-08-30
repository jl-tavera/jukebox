-- A Track is in a Playlist at most once at a time.
--
-- 0002 keyed membership on (playlist_id, track_id, added_at), which says a Track
-- may join a Playlist more than once and is right about that -- history is the
-- reason `removed_at` exists. What it does not say is that a Track cannot be
-- present twice at the same moment, and that became reachable when Resolutions
-- started being delivered more than once: a redelivery that finds no snapshot to
-- compare itself against records its Tracks again, a second later, and the
-- instant in the key is what makes those different rows.
--
-- DESIGN 02's reason for keeping D1 at all is that the KV snapshots can be
-- rebuilt from it. Two current rows for one Track make that rebuild ambiguous --
-- which position wins? -- so "nothing reads these rows yet" is not a licence to
-- let them drift. The read they exist for has not been written, not abandoned.
--
-- The index is also the one that read wants, so it is not a constraint bolted on
-- beside an index doing real work; it is both.

-- Any duplicates already recorded, before the index refuses to be created over
-- them. Reaching this needs only a redelivery, which any Source failure
-- produces, so a database that has been running is not assumed to be clean.
-- The earliest row is the one kept: it holds the instant the Track actually
-- joined, and the position on the rows dropped here is the same one, since a
-- redelivery is the same Resolution reading the same Playlist.
DELETE FROM playlist_tracks
 WHERE removed_at IS NULL
   AND added_at > (
     SELECT MIN(first.added_at)
       FROM playlist_tracks first
      WHERE first.playlist_id = playlist_tracks.playlist_id
        AND first.track_id = playlist_tracks.track_id
        AND first.removed_at IS NULL
   );

CREATE UNIQUE INDEX playlist_tracks_present
    ON playlist_tracks (playlist_id, track_id)
 WHERE removed_at IS NULL;

-- What this does not fix, said here rather than found later. A Resolution that
-- reads *different* contents still leaves membership stale: a Track that left
-- the Playlist keeps a row with no `removed_at`, and one that moved keeps its
-- old position, because the insert that meets it does nothing. Making membership
-- current means soft-deleting what is gone and re-placing what moved, which is
-- Refresh's work and needs Refresh's acceptance criteria -- and nothing
-- re-resolves a Playlist on purpose yet. Until then nothing is wrong, because
-- nothing reads these rows and nothing rebuilds a snapshot from them. A rebuild
-- is exactly what issue #25 wants to write, which is why it waits on Refresh.
