# Jukebox

Jukebox mirrors public playlists and builds a local music library from openly licensed recordings. One domain spans all three surfaces (`cli/`, `worker/`, `site/`): playlists, tracks, and the matching between them.

## Language

### The pipeline

**Resolution**:
Turning a playlist URL into a normalized list of tracks. Runs on the worker.
_Avoid_: Parsing, importing, scraping

**Matching**:
Finding an openly licensed equivalent of a track in a catalog. Runs on the worker, and its results are shared across every user.
_Avoid_: Searching, lookup, linking

**Fetching**:
Downloading, verifying, organizing and reconciling audio files on the user's machine. Runs on the client, never on the worker.
_Avoid_: Syncing, downloading (as a stage name)

**Refresh**:
Re-resolving a tracked playlist against its source on a schedule, to detect membership changes. Distinct from **Sync**.
_Avoid_: Update, poll

**Sync**:
The client asking the worker what changed since the version it last saw, and applying the answer locally. Distinct from **Refresh**.
_Avoid_: Pull, fetch

### The things

**Playlist**:
A tracked collection of tracks, identified by its public URL on a source. Jukebox never owns a playlist; it mirrors one.

**Source**:
A service a playlist is mirrored from — Spotify, later Apple Music and YouTube. Pluggable behind an adapter.
_Avoid_: Provider, platform, service

**Track**:
An entry in a playlist as the source describes it: title, artists, album, duration, ISRC, cover image, position. A track is metadata, never a file.
_Avoid_: Song, item, entry

**Skipped**:
How many entries a source offered that never became tracks — podcast episodes, local files, entries the source will no longer serve. Counted rather than dropped silently, so a list shorter than the source's does not read as data loss. Position keeps the source's own index, so a skip leaves a visible gap rather than renumbering what follows.
_Avoid_: Dropped, filtered, ignored; and the client's per-track `skipped` state (that is a track whose match has tier `none` — this is an entry that never became one)

**Removed**:
A Track the Source no longer lists in a Playlist. Its local record is kept, along with the moment it left, and the word never implies a file was deleted. Distinct from **Skipped**, which never became a Track, and from **Gone**, which describes a Playlist rather than a Track.
_Avoid_: Flagged (names the consequence for a file, not the membership fact), deleted, dropped

**Catalog**:
An open music service holding openly licensed, downloadable recordings — Jamendo, Free Music Archive, Internet Archive, ccMixter, Musopen.
_Avoid_: Library, provider

**Catalog Item**:
A single downloadable recording in a catalog, with a known license. A track's match points at one.
_Avoid_: Result, candidate (a candidate is one considered during matching; an item is the thing itself)

**Match**:
The recorded outcome of matching one track, including the case where no acceptable catalog item exists. A match always exists; it may have no catalog item.

**Tier**:
How much a match can be trusted — `exact`, `probable`, `weak`, or `none`. `none` is a correct and common answer, not a failure.
_Avoid_: Confidence, quality, rating

**Library**:
The user's local folder of downloaded audio. It belongs to the user: Jukebox flags files, and only ever deletes them on an explicit command.
_Avoid_: Collection, catalog (a catalog is upstream and open; a library is local and the user's)

**Mirror**:
The client's local record of the Playlists a user tracks and the Tracks in them. Authoritative for local state only: it can always be rebuilt from the **Library** and a server snapshot. A Playlist can be tracked upstream without being in any given Mirror.
_Avoid_: Cache (a cache may be discarded without loss; this is authoritative), store, state

**Version**:
A per-playlist counter that increases whenever that playlist's contents change. It is the whole of "am I current?" — the client stores the last version it saw, and a sync that finds the same number has nothing to do.
_Avoid_: Revision (a revision is the source's own opaque change token), timestamp, hash

### Playlist status

**Pending**:
Tracked, but not yet resolved. It has no tracks yet.

**Unreachable**:
Resolution failed for a reason expected to be temporary. Jukebox will try again.

**Gone**:
The source will not serve this playlist, and retrying will not help. Covers a playlist that was deleted, made private, or is curated by the source itself and so closed to third-party apps.
_Avoid_: Deleted, missing, 404

### Infrastructure

**Worker-scoped resource**:
Anything a Worker binds to or routes through — D1, KV, Queues, R2, routes, crons. Declared in `wrangler.jsonc` and created by `wrangler deploy`, which writes the resource id back into the config.

**Zone-scoped resource**:
A rule applied to a domain rather than to a Worker — WAF and rate limiting. Set in the dashboard; its live config is exported into `infra/` so a change nobody recorded still appears as a git diff.
_Avoid_: Infra (too broad — name the scope)
