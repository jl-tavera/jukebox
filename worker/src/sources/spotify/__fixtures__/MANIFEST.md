# Spotify fixtures

Real Source responses, captured 2026-08-29 against the live Spotify Web API with a Client
Credentials token. They are the input to `normalize()` (seam 2) and the canned payloads that
stand in for Spotify when global `fetch` is stubbed (seam 1).

Re-cut them with:

```
bun run worker/src/sources/spotify/__fixtures__/capture.ts
```

`capture.ts` lives in this directory rather than a top-level `scripts/` because it is soaked in
Spotify vocabulary — `snapshot_id`, `market`, `uri`, `available_markets` — which DESIGN §03
confines to `worker/src/sources/spotify/`. It encodes the donors and the trim rule, and fails
loudly if a donor stops exhibiting the shape it was chosen for. Update this file when either
changes.

`network.ts` is its sibling and is here for the same reason: it is Spotify standing still, answering
the token request, a playlist's own metadata and a playlist read out of the files beside it so that a
test can drive a whole Resolution without a network. It knows the endpoints and the bearer, so it belongs behind the same
boundary. Nothing under `src/` imports it, so none of it reaches the deployed worker.

## Why these exist

Issue #8 exists to settle one assumption before anything is built on it: that the **Client
Credentials** flow can read an ordinary public, user-made playlist. It can — see finding 1, where
Spotify's own documentation says otherwise. That is why the evidence is committed rather than
summarised.

## The fixtures

Every capture's HTTP status is recorded here because the fixtures hold only bodies. The two 404s
carry their status in the body as well; the 200s do not.

| File | Donor playlist | Status | Kind | What it is for |
|---|---|---|---|---|
| `token.json` | — | `200` | real, redacted | The token response shape. `access_token` is a placeholder; only `token_type` and `expires_in` are real. |
| `playlist-metadata.json` | `3cEYpjA9oz9GiPac4AsH4n` | `200` | verbatim | `name`, `owner`, `snapshot_id` — the source of `title`, `owner` and `revision()`. `name` is read for real as of #30; the other two are still evidence waiting for a member to land on. |
| `one-page.json` | `3cEYpjA9oz9GiPac4AsH4n` | `200` | verbatim | 5 entries, `next: null`. A playlist that fits one page. |
| `multi-page-offset-0.json` | `03Xz4NcdaWjZq2T6sKNLui` | `200` | verbatim | 50 entries, `next` set, `previous: null`. Page one of the walk. |
| `multi-page-offset-50.json` | `03Xz4NcdaWjZq2T6sKNLui` | `200` | verbatim | 19 entries, `next: null`, `previous` set. Page two; 69 total. |
| `several-artists.json` | `7JQrxQmrwXvOnCdx7LNs07` | `200` | verbatim | 40 entries, reaching 3 artists on one. `artists` is always an array. |
| `mixed-entries.json` | two donors | `200` | **composed** | A podcast episode, a local file and a null entry alongside 3 real tracks. |
| `missing-isrc.json` | `6M6POvx8hfKqsM1G8z1Pz5` | `200` | **derived** | A real catalog track whose `external_ids` is empty. |
| `curated-404.json` | `37i9dQZF1DXcBWIGoYBM5M` | `404` | verbatim | What a Spotify-curated playlist answers. |
| `gone-404.json` | `1AAAAAAAAAAAAAAAAAAAAA` | `404` | verbatim | What a well-formed id naming no playlist answers. Byte-identical to the above — that is the point. |

About 214 KB in total.

These are raw Source responses, so they are named for what Spotify returns, not for the domain
state they become. Both 404s map to **Gone** (`CONTEXT.md`: "the source will not serve this
playlist, and retrying will not help… deleted, made private, or curated by the source itself"),
which the API surfaces as `playlist_gone`. The adapter now makes that mapping: a 404 and nothing
else is thrown as `PlaylistGone`, so the Resolution is acknowledged rather than retried. That the
two captures are byte-identical is the evidence for one answer covering all three causes.

Both captures are of `/items`. Since #30 the adapter also reads `/playlists/{id}`, and maps a 404
there the same way — which is **inference, not evidence**: nothing here captures what the plain
address answers for a playlist Spotify will not serve. It is the only claim this directory makes
that no file beside it supports, and a re-capture is where to settle it.

### Two fixtures are not verbatim captures

Both say so in a `_composed` / `_derived` key in the file itself, because presenting either as a
straight capture would be a claim the next reader has no way to check.

- **`mixed-entries.json` is composed.** No single public playlist holds an episode *and* a local
  file *and* a null entry. Every entry in it is a real, unmodified capture — the tracks, local
  file and null entry from `6M6POvx8hfKqsM1G8z1Pz5`, the episode from `2JxNo3xcSFEXUdU7CrKgYn`.
  Only their co-location is constructed. They are ordered so the three surviving tracks sit at
  indexes 0, 2 and 5: the gaps are the point, since `position` preserves Spotify's original index.
- **`missing-isrc.json` is derived.** `external_ids` was emptied on a real entry. The naturally
  occurring ISRC-less shape is the *local file* in `mixed-entries.json`, which carries
  `external_ids: {}` — but local files are skipped before `normalize()` sees them, so nothing
  reaches the `isrc: null` branch as a real catalog track. Since no such track exists to capture
  (finding 3), it had to be constructed. It keeps `is_local: false`, a non-null `id` and its album
  images, so it is *not* the local-file shape wearing a different name.

## Request shape

Two requests per Resolution, in this order:

```
GET /v1/playlists/{id}
GET /v1/playlists/{id}/items?limit=50&additional_types=track,episode
```

- **The playlist's own address carries no query at all**, which is how the metadata above was
  captured and what the adapter sends. A `fields` projection would trim a response already under a
  kilobyte, and would leave the capture as evidence about a request nobody makes.
- **It is read first.** Both orders meet a Gone playlist in their first request, but this is one
  request where the walk is one per fifty entries, so a playlist that will be refused is refused
  having spent the cheaper of the two. It is also the address `revision()` will read `snapshot_id`
  from, so asked first it is where a walk can one day be skipped rather than merely preceded.
- **Captured from `/items`, not `/tracks`.** Spotify's docs mark `/tracks` removed in favour of
  `/items`. Live they are aliases (finding 2), so this costs nothing today and survives the
  deprecation actually landing. For the same reason `normalize()` reads the `item` key.
- **`market` is deliberately not sent.** DESIGN §05 caches one answer globally for every caller;
  a market-scoped response would make that cache market-specific.
- **`additional_types=track,episode` is sent** to fix the *shape* of episode entries, not their
  presence. See finding 5 — this is easy to get wrong.

## Trim rule

An allowlist, not a blocklist, so a field Spotify adds later cannot silently bloat a re-capture.
It takes a 50-entry page from 341 KB to 88 KB. The same discipline is applied to `token.json`, so
no field Spotify may add to the token response can ride along onto disk.

| Level | Kept |
|---|---|
| Envelope | `href`, `limit`, `next`, `offset`, `previous`, `total`, `items` |
| Entry | `added_at`, `is_local`, `item` |
| Track | `id`, `name`, `type`, `uri`, `duration_ms`, `explicit`, `track_number`, `disc_number`, `is_local`, `external_ids`, `artists`, `album`, **plus `popularity`, `preview_url`, `available_markets`** |
| Album | `id`, `name`, `uri`, `album_type`, `release_date`, `release_date_precision`, `total_tracks`, `images` |
| Artist | `id`, `name`, `type`, `uri` |
| Episode | `id`, `name`, `type`, `uri`, `duration_ms`, `explicit`, `release_date`, `is_externally_hosted`, `languages`, `images`, `show` (trimmed to `id`, `name`, `type`, `uri`) |

Three deliberate exceptions to "keep only what the domain needs":

- **`popularity`, `preview_url` and `available_markets` are kept.** Spec #5 declines to carry them
  into the domain. #11 asserts they are dropped, which it can only do if they are in the input.
  `available_markets` is truncated to its first two entries — it is most of the raw payload.
- **All three `album.images` sizes are kept** (640/300/64). Selecting the largest is under test.
- **The duplicate `track` key is dropped.** Every entry arrives carrying both `item` and `track`
  holding the same object; keeping both would double every fixture for nothing.

Dropped everywhere: `added_by`, `primary_color`, `video_thumbnail`, `href` and `external_urls` on
nested objects, and `description` / `html_description` / `audio_preview_url` on episodes.

## Discriminators `normalize()` branches on

Established from the live payloads, not from the documentation:

- **Local file** — `is_local: true`, `item.id === null`, `uri` begins `spotify:local:`,
  `album.images` is `[]`, `external_ids` is `{}`. Note `type` is still `"track"`, so `is_local`
  and the null `id` are the only signals.
- **Null entry** — the entry's `item` is `null` (as is the duplicate `track` the trim removes).
- **Podcast episode** — `item.type === "episode"`; no `album`, no `artists`, no `external_ids`;
  carries `show`. But only when the request asked for it — see finding 5.
- **Cover image** — `album.images` is ordered widest first. Usually 640/300/64, but not always: one
  entry (`several-artists.json` index 29) offers 1280/1280/640. So the largest is *selected* by width
  rather than taken from the front — see finding 6.

## Findings

Each contradicts either Spotify's published documentation or an assumption in spec #5.

1. **The February 2026 migration guide is wrong about access.** It states: "Playlist contents
   (`items`) are only returned for playlists the user owns or collaborates on. For other
   playlists, only metadata is returned and the `items` field will be absent from the response."
   Live, a Client Credentials token — which has no user at all — reads any public playlist's
   entries in full. Taken on trust, that sentence would have sent the project to user OAuth, which
   DESIGN §10 rules out, or ended it.
2. **`/tracks` and `/items` are currently aliases.** Byte-identical responses; only `href`
   differs. Every entry carries both an `item` and a `track` key holding the same object, and the
   playlist metadata object carries both `tracks` and `items` paging objects.
3. **ISRC is not optional in practice.** Across 91 scanned public playlists, *zero* real catalog
   tracks lacked `external_ids.isrc`; only local files did, and those are skipped. The normalized
   shape's `isrc: string | null` stays correct, but the null branch is effectively unreachable for
   real tracks. Worth knowing before Matching is designed to lean on it.
4. **`available_markets`, `popularity` and `preview_url` are still present**, despite the February
   2026 changelog listing them as removed from the Track object. `external_ids` was listed as
   removed too and then reverted in the March 2026 changelog. Treat that changelog as a statement
   of intent rather than of current behaviour.
5. **`additional_types` changes an episode's shape, not its presence — and Spotify drops it from
   its own paging links.** Without `additional_types=episode`, an episode entry still arrives with
   `type: "episode"`, but wearing a track's clothes: it gains `album`, `artists`, `external_ids`,
   `is_local`, `popularity`, `track_number` and `disc_number`, and loses `show`, `images`,
   `description`, `languages` and `release_date`. Nothing is lost or nulled — the shape changes.

   The trap: `next`, `previous` and `href` all echo `additional_types=track`, dropping `episode`.
   So a walk that follows `next` verbatim gets true episode shapes on page one and track-shaped
   episodes from page two on. A `normalize()` that discriminates on the presence of `album` or
   `artists` rather than on `type` would emit a podcast episode as a Track. **The adapter builds
   its own page URLs from `offset` rather than following `next`.** `capture.ts` asserts the link
   still drops the parameter, so the day that changes, this finding fails loudly.

   What the walk does read from `next` is whether it is null, which is a different question from
   where it points -- only the second is the one this finding says not to take Spotify's word for.

6. **A cover image is not optional in practice either, and "largest" is not "first" by definition.**
   Two separate things, both found by #11 building against these files.

   Empty `album.images` occurs four times across every fixture, and all four are entries that get
   skipped — the local files and the episode. *No real catalog track lacking a cover exists here*, so
   `coverImageUrl: null` is unreachable from the captured evidence, exactly as finding 3 describes for
   ISRC. The normalized shape's `string | null` stays correct; the branch is written for the shape, not
   for a case any test drives.

   Separately, `images` is ordered widest-first in every one of these responses, so selecting the
   largest and taking the first agree on all of them — no fixture can tell the two apart. #11 selects
   by width regardless, because the criterion is the largest and the ordering is a convention rather
   than a documented guarantee. That behaviour is pinned by a small constructed input in
   `worker/src/sources/spotify/normalize.test.ts`, which says so where it is written.

## Donor churn

Six of the ten fixtures come from playlists owned by ordinary Spotify users, who can edit or
delete them at any time. That does not affect the committed fixtures — tests read these files and
never call Spotify — but a re-capture may fail on a donor that has changed. The script asserts the
shape it needs and names the donor that failed; pick a replacement exhibiting the same shape and
update both the script and the table above.
