# Jukebox — Design

```
     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
     ███ ███   ███ ███  ▄██▀ ███      ███  ▐█▌ ███▀  ▀███  ▀█████▀ 
███  ███ ███   ███ ███▀▀██▄  ███▀▀▀   ███▀▀▀█▄ ███    ███   ▄███▄  
███▄▄███ ███▄▄▄███ ███   ███ ███▄▄▄▄▄ ███▄▄▄██ ▀███▄▄███▀ ▄███▀███▄
 ▀▀▀▀▀▀   ▀▀▀▀▀▀▀  ▀▀▀   ▀▀▀ ▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀    ▀▀▀▀▀▀   ▀▀▀   ▀▀▀
```

**Status:** draft · **Scope:** mechanics, not framing

## What this document is

`README.md` says *what* Jukebox does and *what* it is built with. `CLAUDE.md` states the architecture invariants that must not be broken. This document sits one level below both: it turns those invariants into implementable mechanics — schemas, wire formats, state machines, scoring, and failure behaviour.

Read it as the bridge between "we decided this" and "here is how it works".

| Document | Owns |
|---|---|
| `README.md` | Product framing, install, stack tables, roadmap. Source of truth for user-facing copy. |
| `CLAUDE.md` | Architecture invariants. Non-negotiable without an ADR. |
| **`docs/design/DESIGN.md`** | **Mechanics: pipeline, schemas, protocol, scoring, failure modes.** |
| `docs/design/SITE.md` | The site: information architecture, design system, copy deck. |
| `docs/adr/` | Individual decisions, with context and consequences. **Supersedes this document on conflict.** |

### How to read the confidence markers

None of the three deployable surfaces exist yet, so this document mixes settled constraints with proposals. It marks which is which, because a reader who cannot tell the difference will treat a guess as a requirement:

- **Invariant** — derived from `CLAUDE.md`. Changing it undoes the cost or availability model. Needs an ADR.
- **Proposed** — this document's own suggestion. Reasonable, unvalidated, change it freely during implementation.
- **Open** — genuinely undecided. Listed in §11 rather than given a fake answer.

Anywhere a concrete number would need real measurement (Cloudflare pricing, score thresholds, refresh intervals), the number is deliberately absent. A plausible-looking invented constant is worse than a blank, because it gets copied.

---

## 01 · Pipeline, end to end

Three concerns — resolution, matching, fetching — split across two runtimes. The README explains *why* they are split. Here is the actual sequence.

```
  CLIENT (Bun binary)                 WORKER (Hono / CF)              UPSTREAM
  ===================                 ==================              ========

  jukebox add <url>
        |
        |  POST /playlists {url}
        |--------------------------->  parse url
        |                             +- source adapter claims it
        |                             upsert playlists row        (D1)
        |                             enqueue REFRESH             (Queue)
        |  <--------------------------  202 {id, status:"pending"}
        |
        :                                    ... decoupled ...
        :
        :                            +-- CRON (fixed budget) --+
        :                            |  select playlists due   |
        :                            |  enqueue REFRESH x N    |
        :                            +------------+------------+
        :                                         v
        :                             REFRESH consumer
        :                             adapter.fetch() ------------->  playlist API
        :                             adapter.normalize()  <--------  raw
        :                             diff vs playlist_tracks    (D1)
        :                             write membership changes
        :                             enqueue MATCH for new tracks
        :                             version++ ; write KV snapshot
        :                                         |
        :                             MATCH consumer
        :                             score candidates ------------>  catalogs
        :                             write matches row    <--------  results
        :                             version++ ; refresh KV
        :
  jukebox sync
        |
        |  GET /playlists/{id}/tracks
        |  If-None-Match: "v41"
        |--------------------------->  read playlist:{id}:head    (KV)
        |  <--------------------------  304   <-- common case, ~zero cost
        |
        |  (or, when changed)
        |  <--------------------------  200 {version, added[], removed[], rematched[]}
        |
        |-- for each added ----->  GET download_url ------------->  catalog CDN
        |                         stream to .part   <-------------  bytes
        |                         verify -> atomic rename -> organize
        |                         record state                 (sqlite)
        |
        |-- for each removed --->  flag only. never delete.
        |
        +-- write last_version / last_etag                      (sqlite)
```

Three properties of this diagram are load-bearing:

**The dotted gap is the cost model.** `jukebox add` enqueues and returns. It does not fetch from upstream. Only the cron consumer talks to a playlist API, which is what makes upstream usage proportional to distinct playlists rather than to users or requests. *(Invariant.)*

**Audio bytes have their own arrow.** They travel catalog → client, never touching the worker column. There is no server-side path for audio, and adding one — even as a cache — introduces the bandwidth bill the project is designed not to have. *(Invariant.)*

**Version is the only synchronisation primitive.** Both the refresh consumer and the match consumer bump it; the client's entire notion of "am I current" is one integer. Everything in §05 follows from that.

---

## 02 · Data model

Three stores with genuinely different jobs. The split is what allows most reads to cost a single KV lookup.

### D1 — canonical, write-rare

Read on the cold path only. Every user-facing read should be served from KV; D1 exists so KV can be rebuilt.

```sql
-- A tracked playlist, identified by its public URL.
CREATE TABLE playlists (
  id                 TEXT PRIMARY KEY,     -- internal id, not the source's
  source             TEXT NOT NULL,        -- spotify | apple | youtube
  source_id          TEXT NOT NULL,        -- id within that source
  url                TEXT NOT NULL,
  title              TEXT,
  owner              TEXT,
  source_revision    TEXT,                 -- see 03: cheap did-it-change probe
  version            INTEGER NOT NULL,     -- monotonic; the ETag
  refresh_interval_s INTEGER NOT NULL,
  last_refreshed_at  INTEGER,
  status             TEXT NOT NULL,        -- pending | ok | unreachable | gone
  UNIQUE (source, source_id)
);

-- A track as it exists in the playlist source. Not a file.
CREATE TABLE tracks (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,
  source_track_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  artist          TEXT NOT NULL,
  album           TEXT,
  duration_ms     INTEGER,
  isrc            TEXT,                    -- when the source exposes it
  normalized_key  TEXT NOT NULL,           -- see 04; the matching cache key
  UNIQUE (source, source_track_id)
);

-- Membership. Soft-deleted so history survives.
CREATE TABLE playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id),
  track_id    TEXT NOT NULL REFERENCES tracks(id),
  position    INTEGER NOT NULL,
  added_at    INTEGER NOT NULL,
  removed_at  INTEGER,                     -- NULL = currently present
  PRIMARY KEY (playlist_id, track_id, added_at)
);

-- A downloadable, openly licensed recording in an open catalog.
CREATE TABLE catalog_items (
  id           TEXT PRIMARY KEY,
  catalog      TEXT NOT NULL,   -- jamendo | fma | ia | ccmixter | musopen
  catalog_id   TEXT NOT NULL,
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  duration_ms  INTEGER,
  license      TEXT NOT NULL,   -- required; gates eligibility (see 04)
  download_url TEXT NOT NULL,
  format       TEXT,            -- mp3 | flac | ogg | ...
  bytes        INTEGER,
  checksum     TEXT,            -- when the catalog publishes one
  UNIQUE (catalog, catalog_id)
);

-- The shared, global result of matching. One row per (track, algo version).
CREATE TABLE matches (
  track_id           TEXT NOT NULL REFERENCES tracks(id),
  catalog_item_id    TEXT REFERENCES catalog_items(id),  -- NULL when tier=none
  tier               TEXT NOT NULL,   -- exact | probable | weak | none
  score              REAL,
  method             TEXT NOT NULL,   -- isrc | fuzzy | manual
  match_algo_version INTEGER NOT NULL,
  matched_at         INTEGER NOT NULL,
  PRIMARY KEY (track_id, match_algo_version)
);
```

Keying `matches` on `match_algo_version` instead of overwriting makes an algorithm change additive: new rows land alongside the old, a head pointer moves, and a bad rollout is revertible without recomputation.

### KV — the hot read path

```
playlist:{id}:head        ->  "42"                        <- the only mutable key
playlist:{id}:v{n}        ->  {version, etag, tracks[]}   <- immutable, forever
delta:{id}:{from}:{to}    ->  {added[], removed[], rematched[]}    (proposed)
```

Versioned keys are immutable, so there is nothing to invalidate and no read-modify-write race. A refresh writes the new snapshot **first**, then moves `head`. A reader that catches the old `head` gets a consistent older snapshot — never a torn one.

`delta:` is **proposed**. Deltas can equally be computed from two snapshots on demand; precompute only if measurement shows the snapshot diff is the expensive part.

### Client — `bun:sqlite`

Authoritative for *local* state only. It can always be rebuilt from the filesystem plus a server snapshot (§09).

```sql
CREATE TABLE playlists (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  local_path    TEXT NOT NULL,
  last_version  INTEGER,
  last_etag     TEXT,
  last_sync_at  INTEGER
);

CREATE TABLE tracks (
  playlist_id     TEXT NOT NULL,
  track_id        TEXT NOT NULL,
  catalog_item_id TEXT,
  title           TEXT NOT NULL,
  artist          TEXT NOT NULL,
  state           TEXT NOT NULL,   -- see state machine below
  file_path       TEXT,
  checksum        TEXT,
  bytes           INTEGER,
  downloaded_at   INTEGER,
  PRIMARY KEY (playlist_id, track_id)
);

-- Append-only. Makes sync resumable and reconcile explainable.
CREATE TABLE events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  payload TEXT NOT NULL
);
```

Per-track state machine:

```
                 +------------------ no open match (tier=none)
                 v
   pending ------------------> skipped
      |
      | download + verify ok
      v
   downloaded ---------------> flagged        (removed upstream; file kept)
      |                           |
      | file gone, or verify      | jukebox prune
      v fails on recheck          v
   missing                     (deleted)
      |
      +-- retried on next sync
```

`downloaded → flagged` is deliberately not `→ deleted`. The client never destroys a file because a remote playlist changed; that takes an explicit `jukebox prune`. The local library belongs to the user.

---

## 03 · Resolution and the source-adapter seam

Spotify is first, Apple Music and YouTube come later, so the seam has to exist before the second source does — retrofitting it means auditing every call site. *(Invariant: no Spotify assumptions outside the adapter.)*

### The interface

```ts
interface PlaylistSource {
  readonly id: 'spotify' | 'apple' | 'youtube'

  /** Does this adapter own this URL? Cheap, no network. */
  claims(url: string): boolean

  /** URL -> stable source-local id. Throws on malformed input. */
  parse(url: string): { sourceId: string }

  /**
   * Cheap change probe. Returns an opaque revision token when the source
   * offers one, or null when it does not. Never counts as a full fetch.
   */
  revision(sourceId: string, ctx: Ctx): Promise<string | null>

  /** The one expensive call. Only ever invoked from the cron consumer. */
  fetch(sourceId: string, ctx: Ctx): Promise<RawPlaylist>

  /** Source-shaped -> domain-shaped. Pure, synchronous, unit-testable. */
  normalize(raw: RawPlaylist): NormalizedPlaylist
}
```

### The normalized shape

Everything downstream of `normalize` sees only this. It is the actual contract:

```ts
interface NormalizedTrack {
  sourceTrackId: string
  title: string
  artists: string[]      // always an array, even for one artist
  album: string | null
  durationMs: number | null
  isrc: string | null    // strongest matching signal when present
  position: number
}

interface NormalizedPlaylist {
  sourceId: string
  title: string | null   // null where the source offers no usable name
  owner: string | null
  revision: string | null
  tracks: NormalizedTrack[]
}
```

### The enforcement rule

No Spotify vocabulary — `snapshot_id`, `market`, `uri`, `available_markets` — appears outside `worker/src/sources/spotify/`. Worth enforcing with a lint rule or an import boundary check in CI, because this is the kind of constraint that erodes silently under deadline pressure.

Where a source-specific concept is genuinely valuable it gets generalised rather than banned. Spotify's `snapshot_id` is the clearest case: it answers "did this playlist change" for one cheap request, which is exactly what a fixed refresh budget wants. So it is generalised as `revision()` returning an opaque token, and stored as `playlists.source_revision`. Sources without an equivalent return `null` and always take the full-fetch path.

`revision()` earning its place: when it returns an unchanged token, the refresh consumer skips `fetch()`, skips the diff, and does not bump `version`. Clients then get `304` (§05) and the playlist costs one upstream request per refresh window instead of a full pagination walk.

---

## 04 · Matching: candidates, scoring, tiers

### The boundary that shapes everything

Matching finds an **openly licensed equivalent** of a playlist entry in an open catalog. It never sources the original copyrighted recording, and there is no code path that could — the catalogs indexed in `catalog_items` contain only openly licensed material, and `license` is a `NOT NULL` column precisely so an item with unclear licensing cannot enter the table.

The direct consequence: **most playlist tracks will not match, and that is correct behaviour.** A mainstream commercial track has no Creative Commons equivalent, so it resolves to `tier = 'none'`. That is an accurate result, not a failure to be engineered away. Coverage statistics should be presented to users as a property of the open catalogs, never as a bug in Jukebox.

This is the single most important thing to understand before touching matching code, because a reasonable-seeming "improvement" that raises match rates by loosening license checks breaks the project's premise.

### Normalization

Both sides reduce to a comparable key before scoring. `tracks.normalized_key` caches the result:

```
"Song Title (feat. X) - 2011 Remaster"
  -> lowercase
  -> strip parenthetical/bracketed qualifiers: feat., remaster, live,
     radio edit, remix, deluxe, mono/stereo, bonus track
  -> strip punctuation, collapse whitespace
  -> unicode NFKD, drop combining marks
  -> "song title"
```

Qualifier stripping is lossy on purpose for *candidate generation*, and the discarded qualifiers are kept for *scoring* — a live version matching a studio version should still lose points. **Proposed**; the qualifier list needs real playlist data.

### Candidate generation

Per catalog, cheap prefilters first: exact `isrc` when both sides have one (a direct hit, `method = 'isrc'`), otherwise `normalized_key` equality, then artist-token overlap. The goal is a small candidate set, not a good one — scoring decides quality.

### Scoring signals

| Signal | Why it matters |
|---|---|
| ISRC equality | Decisive when present. Skips scoring entirely. |
| Title similarity | On normalized keys; edit distance or token-set ratio. |
| Artist similarity | Token-set, order-insensitive. Handles "A & B" vs "B and A". |
| Duration delta | Strong negative signal. A 30-second gap is a different recording. |
| Qualifier agreement | Live-vs-studio, remix-vs-original penalties from stripped tokens. |
| License eligibility | **Hard gate, not a score.** Ineligible items never become candidates. |
| Catalog trust weight | Per-catalog metadata quality prior. |

### Tiers

| Tier | Meaning | Client behaviour |
|---|---|---|
| `exact` | ISRC hit, or score above the high threshold | Download automatically |
| `probable` | Above the low threshold | Download, mark for review |
| `weak` | Plausible but unconvincing | Surface only; never auto-download |
| `none` | No eligible candidate | `skipped`; the expected common case |

Thresholds are **open** — see §11. Setting them without a labelled sample would be guessing, and the two failure directions are asymmetric: a wrong `exact` puts an incorrect file in someone's library, while a missed match costs nothing but a listing. Bias conservative.

### Why this caches so well

A match is a pure function of `(normalized_key, catalog corpus, match_algo_version)`. It contains nothing user-specific, so it is computed once and shared by every user forever — the same property that makes the cache hit rate approach 100%. *(Invariant.)*

Recomputation is therefore always a **batch job**, triggered by a corpus refresh or an algorithm bump, never by a user request. A user request that could trigger matching would reintroduce per-user upstream cost through the back door.

Corrected matches enter as `method = 'manual'` rows and outrank computed ones at the same `match_algo_version`.

---

## 05 · Sync protocol

The design target: **the overwhelmingly common sync does nothing and costs nothing.** *(Invariant: preserve conditional-request handling.)*

### The 304 path

```http
GET /playlists/{id}/tracks HTTP/1.1
If-None-Match: "42"
```

```http
HTTP/1.1 304 Not Modified
ETag: "42"
Cache-Control: no-cache
```

Serving this reads exactly one KV key (`playlist:{id}:head`), compares it to the inbound `If-None-Match`, and returns. No D1 query, no snapshot read, no JSON parse. Any change that puts a D1 query on this path is a regression even if it passes tests.

The ETag is the monotonic `playlists.version` — the same integer the refresh and match consumers bump. Strong ETag, since it identifies an immutable snapshot exactly.

### The delta path

```http
GET /playlists/{id}/tracks?since=41 HTTP/1.1
```

```json
{
  "version": 44,
  "from": 41,
  "added": [
    {
      "trackId": "t_7f3a",
      "title": "…",
      "artist": "…",
      "position": 12,
      "match": {
        "tier": "exact",
        "catalog": "jamendo",
        "downloadUrl": "https://…",
        "format": "mp3",
        "bytes": 8123456,
        "checksum": "sha256:…"
      }
    }
  ],
  "removed": ["t_1c02"],
  "rematched": [
    { "trackId": "t_44de", "match": { "tier": "probable", "…": "…" } }
  ]
}
```

Rules:

- **`removed` carries ids, not instructions.** The server states that membership ended; the client decides what that means for files, and the answer is always "flag, never delete".
- **Deltas are idempotent.** State transitions are keyed on `(track_id, version)`, so replaying a delta after a crash mid-apply converges to the same state. This is what makes an interrupted sync safe.
- **`rematched` exists because matches improve.** A track that was `none` last week can become `exact` after a corpus refresh, with no playlist change at all. Without this the shared cache's improvements would never reach existing users.
- **Omitting `since` returns a full snapshot.** The client also falls back to a full snapshot when its `last_version` is too old for the retention window (§11), or when it has no `last_version`.
- **No auth, no accounts.** The playlist URL is the identity; every response is derived from public data and is identical for all callers, which is why it caches globally.

### Client apply order

Additions before removals, and the local database written before the download starts, so a crash leaves a `pending` row rather than an untracked file. Every applied delta appends to `events`.

---

## 06 · Fetching: verify, organize, reconcile

Runs entirely on the client, straight from `match.downloadUrl` to disk. *(Invariant: bytes never pass through our infrastructure.)*

### Download and verify

Stream to `{final}.part`, then verify before it is allowed to become a real file:

1. **Byte length** against `match.bytes` when supplied.
2. **Checksum** against `match.checksum` when the catalog publishes one.
3. **Container sniff** — read the magic bytes and confirm the file is actually the audio container its extension claims.

Step 3 is the one worth insisting on. The realistic failure is not a corrupted download; it is a catalog returning `200 OK` with an HTML error page, a rate-limit notice, or a login redirect, which a naive client writes to disk as a perfectly valid-looking `.mp3`. That file then sits in the library forever and only surfaces when someone tries to play it. Length and checksum checks miss it whenever the catalog omits that metadata; a magic-byte check does not.

Only after all applicable checks pass is `.part` atomically renamed into place. A failed verify discards the partial and leaves the track `pending`, so the next sync retries it. Nothing that verified is ever re-downloaded.

### Organize

```
{library}/{artist}/{album}/{nn} - {title}.{ext}
```

With: per-platform filename sanitization (Windows reserved names and characters are the strict case, and this project's primary environment), length capping on the path as a whole rather than per-segment, `{nn}` zero-padded from playlist position, and a `~2`-style suffix on collision. Tracks with no album fall back to a `Singles` directory. **Proposed** — the template should be user-configurable.

### Reconcile

`jukebox sync` reconciles three views: the server snapshot, the local database, and the filesystem. Divergences resolve as:

| Divergence | Resolution |
|---|---|
| In snapshot, not local | Download (subject to tier) |
| Local, not in snapshot | `flagged`. File kept. |
| Local row, file missing | `missing`, retried next sync |
| File present, no local row | Adopted if it verifies; otherwise left alone |
| Local row, match tier changed | Re-download only if the tier improved |

"Adopted if it verifies, otherwise left alone" matters: a user's own files living in the library directory must survive a sync untouched. Deleting anything requires an explicit `jukebox prune`, which lists what it will remove and asks first.

---

## 07 · Discovery and version gating

The API URL is not compiled into the binary. On boot the CLI reads `discovery.json` from the **site** Worker. *(Invariant, and the reason for two Workers: the discovery endpoint and install script must outlive an API outage.)*

```json
{
  "api": "https://api.jukebox.dev",
  "min_version": "0.4.0",
  "status": "ok",
  "message": null
}
```

### Boot sequence

1. Read cached discovery from local SQLite if it is fresh.
2. Otherwise fetch `https://jukebox.dev/discovery.json`; on network failure, fall back to the stale cached copy and warn rather than dying.
3. If the CLI's own version is below `min_version`, stop with an upgrade instruction. This is a hard stop, not a warning — a client that predates a breaking contract change cannot safely proceed.
4. If `status` is not `ok`, print `message` verbatim and exit cleanly.

Step 4 is the whole point of the `message` field. During an outage the user should read a sentence written by a human, not a stack trace or a JSON parse error from a 502 error page.

### Breaking-change procedure

Order matters, and it is counterintuitive:

1. Ship a CLI release that understands both the old and the new contract.
2. Wait for adoption.
3. Deploy the API change.
4. **Only then** raise `min_version`.

Raising `min_version` before a compatible binary is available bricks every installed client. The gate is a safety net for the last step, not a substitute for the first three.

Because discovery is a static file on the site Worker, an API deploy cannot break it, and the kill switch stays reachable when the API is entirely down.

---

## 08 · Cost model

The architecture exists to keep hosting flat. Stating the scaling terms explicitly makes it obvious which changes would break that.

| Resource | Scales with | Does **not** scale with |
|---|---|---|
| Upstream playlist API calls | distinct playlists × refresh frequency | users, syncs, requests |
| Matching compute | distinct *unmatched* tracks | users, syncs |
| KV reads | syncs (one read on the `304` path) | library size, audio volume |
| KV writes | version bumps | users |
| D1 reads | cold reads and refresh diffs | syncs |
| Queue messages | playlists refreshed + tracks matched | users |
| **Egress for audio** | **nothing — structurally zero** | everything |

Two terms deserve emphasis.

**Upstream calls are per playlist, not per user.** A thousand users tracking the same playlist cost exactly what one user costs. This is what the cron boundary in §01 buys, and it is why an on-demand fetch — however well cached — is prohibited.

**Matching amortizes toward zero.** Every track matched is matched for everyone, forever. Early on this is the dominant cost; as the corpus warms, the marginal cost of a new user approaches the cost of their `304`s.

No prices appear here on purpose. The real numbers depend on Cloudflare's current limits and on measured request volumes, neither of which this document can responsibly assert. What it *can* assert is the shape: if a change makes any row in that right-hand column non-empty, the flat-cost model is gone.

---

## 09 · Failure modes

Every dependency here can fail independently, and the system should degrade rather than stop. Written as a table because that is how it will be consulted at 3am.

| Failure | Detection | Degradation | What the user sees |
|---|---|---|---|
| Upstream playlist API down | Refresh consumer errors | Cached snapshots still served | Syncs work; playlist goes stale |
| Playlist deleted or made private | `fetch` returns 404/403 | `status = 'gone'`; refresh stops | Told the playlist is unreachable; local files untouched |
| API Worker down | CLI request fails | Discovery still up (separate Worker) | Real outage message; local library fully usable |
| D1 unavailable | Query errors | KV still serves all reads | Syncs work; refreshes queue up |
| KV unavailable | Read errors | Fall back to D1 + rebuild snapshot | Slower syncs, correct results |
| Catalog download 404 | HTTP status | Track marked `missing` | Sync continues; one track listed as unavailable |
| Catalog returns an error page as audio | **Container sniff** (§06) | `.part` discarded | Retried next sync; no poisoned file |
| Partial or interrupted download | `.part` never renamed | Track stays `pending` | Resumes on next sync |
| Interrupted sync mid-apply | `events` log + idempotent deltas | Replay converges | No visible effect |
| Client database corrupt | Open fails / integrity check | Rebuild from filesystem + server snapshot | Slow first sync; files preserved |
| Bad match algorithm shipped | Elevated `probable` rate, reports | Bump `match_algo_version`, batch re-match | Corrections arrive via `rematched` |
| Queue backlog | Depth metric | Refresh lag grows | Playlists update later than usual |

The pattern across every row: **the local library is never at risk from a remote failure.** Files are only written after verification and only deleted on explicit instruction, so the worst outcome of any backend problem is staleness.

---

## 10 · Non-goals

Stated as firmly as the invariants, because these are the requests that will arrive and the pressure will be to accommodate them.

- **Not a Spotify / Apple Music / YouTube downloader.** Jukebox matches playlist entries to openly licensed equivalents. It does not download from the playlist source.
- **No DRM circumvention.** Not a compromise position — the architecture has no path to protected content, and no feature that would need one will be added.
- **No server-side audio proxy or cache.** Even a small one. This is the bandwidth bill the project is built to avoid.
- **No private playlists, no user OAuth.** Public playlists only. Per-user credentials would mean per-user upstream calls and a per-user cache, invalidating §04 and §08 together.
- **No accounts.** The playlist URL is the identity. Nothing about a response depends on who is asking, which is why everything caches globally.
- **No server-side transcoding.** The catalog's format is the format.
- **No on-demand upstream fetch.** Not even with a "refresh now" button. *(Invariant.)*
- **No inflated match rates.** Coverage is a property of the open catalogs. Loosening license checks to improve the numbers breaks the premise (§04).

---

## 11 · Open questions

Real gaps, listed so they get resolved as ADRs rather than as accidents of implementation. Each is a question this document deliberately does not answer.

**Match score thresholds.** Where `exact` / `probable` / `weak` divide. Needs a hand-labelled sample of real playlist tracks against real catalog candidates. Blocking meaningful match quality work.

**Refresh interval policy.** Fixed interval for every playlist, or weighted by how many users track it and how often it actually changes? Weighting spends the upstream budget better but adds a feedback loop worth understanding before building.

**Catalog corpus strategy.** Does `catalog_items` get populated by a crawler (fast matching, staleness and storage to manage) or queried live at match time (always current, slower, dependent on catalog rate limits)? Possibly per catalog. Affects §02 and §04 materially.

**Crowd-sourced match corrections.** README lists this as future work. Requires a trust model — who can correct, how corrections are validated, how to resist someone mapping every track to one item. Do not build the submission path before the abuse model.

**Cross-playlist deduplication.** One catalog item in three playlists: three copies, hardlinks, symlinks, or a content-addressed store with links? Filesystem portability makes this genuinely hard on Windows.

**Delta retention window.** How far back `?since=` is honoured before forcing a full snapshot. Trades KV storage against bandwidth for infrequent syncers.

**`--json` stability guarantees.** README lists `--json` for scripting and agent use. Agents will depend on the shape, so it needs a versioning story before it ships, not after.

**Import-boundary enforcement.** Whether the §03 rule is a lint rule, a CI check, or convention. Convention will not hold.
