# Jukebox

Sync your playlists. Own your music.

---

## What it is

Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries.

You give it a playlist URL. It tracks the songs in that playlist and keeps a local folder in sync as the playlist changes — new tracks get downloaded, removed tracks get flagged.

Spotify first. Apple Music and YouTube later — the design treats playlist sources as pluggable from day one.

**macOS and Linux:**

```bash
curl -fsSL https://jukebox-site.joseluis64tavera.workers.dev/install.sh | sh
```

**Windows:**

```powershell
irm https://jukebox-site.joseluis64tavera.workers.dev/install.ps1 | iex
```

Then, on any of them:

```bash
jukebox add https://open.spotify.com/playlist/...
jukebox sync
```

Or run `jukebox` on its own. At a terminal that opens a menu, so there is nothing to memorise to get started. **Only `quit` works so far** — the other entries are listed, and each one names the command to run instead. As they are wired up they will run those same commands and print the same output the flags would have; nothing will be reachable in the menu that a flag cannot reach. In a pipe, a redirect or a script, bare `jukebox` is unchanged — see [Scripting and agents](#scripting-and-agents).

Both installers put a single self-contained binary in a per-user folder and add that folder to your PATH. Nothing is compiled, and neither one needs root or an administrator.

> **On the address.** `jukebox.dev` is registered to somebody else, so Jukebox is served from a `workers.dev` address until that is settled. The CLI reads its backend's address from this same site at runtime rather than having one compiled in, so moving is one edited line and a deploy — no reinstall. See [SITE.md §08](docs/design/SITE.md).

> **On Windows, the first run shows a SmartScreen warning.** The binary is not code-signed yet. Choose *More info → Run anyway*, or check the SHA-256 against `SHA256SUMS` on the [release](https://github.com/jl-tavera/jukebox/releases) first. Tracked in [#48](https://github.com/jl-tavera/jukebox/issues/48), and a blocker on announcing Jukebox anywhere.

---

## How it works

Three concerns, deliberately separated:

| Concern | What it does | Where it runs |
|---|---|---|
| **Resolution** | Playlist URL → normalized track list | Backend |
| **Matching** | Track → candidate in an open catalog | Backend |
| **Fetching** | Download, verify, organize, reconcile | Client |

The backend handles metadata and matching. The CLI downloads audio **directly from the catalog** — bytes never pass through our infrastructure.

Three reasons this split matters:

1. **Secrets.** API credentials can't ship inside a distributed binary.
2. **Shared work.** A track resolves to the same match for every user. Compute once, cache globally.
3. **Cost.** No bandwidth bill, ever. Hosting stays flat regardless of how much music people download.

One more design property worth stating: **user requests never trigger an upstream playlist fetch.** A scheduled job refreshes tracked playlists on a fixed budget; the API only ever reads from cache. Upstream API usage scales with the number of distinct playlists, not with the number of users.

---

## Scripting and agents

Every command computes one result and then renders it. Pass `--json`, or simply pipe the output somewhere, and you get exactly one JSON object on stdout instead of human text:

```json
{ "ok": true, "command": "sync", "version": "0.1.0", "data": {} }
```

A failure carries a stable machine-readable code beside the human message, in one vocabulary shared with the API:

```json
{ "ok": false, "command": "add", "version": "0.1.0",
  "error": { "code": "invalid_url", "message": "No source recognises this URL." } }
```

A non-zero exit means the command genuinely failed. Every answer the backend can give — including *nothing changed*, *still resolving* and *that playlist is gone* — is a success, so a scheduled sync reports a failure only when there was one.

In a pipe or a CI job there are no prompts and no spinners: nothing can hang waiting for an answer nobody is there to give.

**The JSON shape is unstable before 1.0.** It can change in any release, with no notice beyond the release notes, and it freezes at 1.0. The `version` field in every object is what to pin or branch on. See [ADR-0005](docs/adr/0005-json-output-is-unstable-before-1-0.md).

---

## Reading your mirror

Three commands read the local record back. None of them touches the network, so they work on a train, during an outage, and with the Wi-Fi off.

| Command | What it does |
|---|---|
| `jukebox list` | Every playlist you track |
| `jukebox show <playlist>` | One playlist and the tracks recorded for it |
| `jukebox remove <playlist>` | Stop tracking one, on this machine |

`list` gives a line per playlist — its status, what it holds, and when your copy last changed:

```
  spotify:1AbCdEfGhIjKlMnOpQrStU                    pending   no tracks             never updated
  "Rain / Shine" (spotify:3cEYpjA9oz9GiPac4AsH4n)   ok        2 tracks, 1 removed   updated 2026-08-31 21:29
```

The id is on every row because it is what `show` and `remove` take, so the line you are reading always carries the string the next command wants.

That last column says *updated*, not *synced*, and the difference is worth knowing: a sync that finds nothing changed costs nothing and writes nothing. The timestamp is when your copy last moved, not when Jukebox last asked.

`show` takes either the id `list` prints or the address you added the playlist with, and lists its tracks in the source's own order:

```
"Rain / Shine" (spotify:3cEYpjA9oz9GiPac4AsH4n)
2 tracks, 1 removed, 1 entry skipped.

      Long Way Down   Aria Fenn, Kit Marlow   Ninety Miles   4:02
      Sun Dogs        Aria Fenn               Ninety Miles   2:58

Removed, and still recorded here:
  -   Blue Dot        Aria Fenn               Ninety Miles   3:34   left 2026-08-31 21:29
```

**A track that leaves a playlist is kept, not deleted.** Its row stays, with the date it left. That is what lets `sync` tell you what changed instead of printing one number and then another, and it is why your copy can tell you what a playlist used to hold — the server stores what a playlist contains now, and nothing else remembers the rest.

Addresses are matched exactly as you typed them when you added the playlist. Nothing is normalised, so the same playlist pasted a second time with a tracking parameter on the end will not be found; `jukebox list` is always the way back to a name that works.

`remove` stops tracking a playlist and deletes its local rows. **It affects your machine only.** There is no account and nothing upstream knows you were tracking anything, so there is nothing to tell and no endpoint to tell it to — the playlist, its source, and anyone else tracking the same one are untouched. There is no confirmation prompt because there is nothing to lose that `jukebox add` cannot fetch again, and the command prints the exact line to do it with.

---

## Configuration

`jukebox config` shows every setting, its value, and whether that value came from a default, the file, or the environment.

```
  library_path          C:\Users\ada\Music\Jukebox   (default)
  sync_interval_hours   24                           (default)
```

Two settings ship, in a TOML file in your platform's configuration directory — `%APPDATA%\Jukebox` on Windows, `~/Library/Preferences/Jukebox` on macOS, `$XDG_CONFIG_HOME/jukebox` (or `~/.config/jukebox`) on Linux. `jukebox config` prints the exact path, including when there is no file there yet.

```toml
# Single quotes, so a Windows path needs no escaping.
library_path = 'D:\Music\Jukebox'
sync_interval_hours = 6
```

Give `jukebox config` a setting and a value and it writes that file for you, creating it if there is none:

```
jukebox config library_path 'D:\Music\Jukebox'
jukebox config sync_interval_hours 6
```

Quote a path with spaces in it, or the shell hands Jukebox two words and it refuses rather than storing half a path. A setting it does not know and a value that will not parse are both refused with the reason, and nothing is written in either case.

Writing rebuilds the file from the two settings Jukebox understands, so any comments you kept in there go — it says so when that happens. A file it cannot parse at all is left exactly as it is rather than replaced; fix it or delete it, then set the value again.

| Setting | Default | Environment |
|---|---|---|
| `library_path` | A `Jukebox` folder in your music directory | `JUKEBOX_LIBRARY` |
| `sync_interval_hours` | `24` | `JUKEBOX_SYNC_INTERVAL_HOURS` |

Your music directory is `~/Music` on Windows and macOS. On Linux it honours `XDG_MUSIC_DIR` if you export it, and falls back to `~/Music`.

The environment wins over the file, and the file wins over the default. `jukebox config` names the variable beside any value the environment supplied, so there is always something to unset. Anything Jukebox had to ignore — a file that will not parse, a misspelled key, a value of the wrong type — is reported in the output rather than passed over, and the setting falls back rather than the command failing.

Setting a value whose variable is exported writes it and then tells you the variable still wins, so a change that cannot take effect never looks like it did. Moving `library_path` tells you that anything already downloaded stays in the old folder: Jukebox never moves your files, and it will not look there again.

**Nothing acts on either setting yet.** There is no scheduler and no daemon in this release, so `sync_interval_hours` is recorded and never read. Fetching does not exist either, so no file is written to `library_path` and no folder is created there — not even by setting it. Both are real settings governing decided behaviour ([ADR-0004](docs/adr/0004-a-folder-per-playlist.md) is the Library's layout), and they take effect when the features that read them land.

There is deliberately no first-run prompt asking where your Library should live. Asking you to choose a folder for files that cannot yet arrive is a promise this release does not keep.

`JUKEBOX_HOME` relocates Jukebox's own two directories at once, which is useful for trying it out without touching anything. It does not move your Library: that is your folder, not ours.

---

## Stack

### CLI

| | |
|---|---|
| Language | TypeScript |
| Runtime | Bun |
| Framework | citty |
| Prompts | @clack/prompts |
| Colors | picocolors |
| Primitives | cligentic blocks (copy-paste, zero runtime dep) |
| Local database | `bun:sqlite` |
| Build | `bun build --compile` → single binary |

Bun is the pick because `bun:sqlite` is built into the runtime — no native module, no install-time compilation, and it bundles cleanly into a standalone executable.

### Backend

| | |
|---|---|
| Language | TypeScript |
| Framework | Hono |
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| Scheduler | Cloudflare Cron Triggers |

### Site

| | |
|---|---|
| Framework | Next.js (static export) |
| Styling | Tailwind + shadcn/ui |
| Hosting | Cloudflare Workers static assets |

### Shared & ops

| | |
|---|---|
| Contract | OpenAPI spec → generated types for both sides |
| IaC | Wrangler (Cloudflare) |
| CI/CD | GitHub Actions |
| Distribution | GitHub Releases + `curl \| sh` and `irm \| iex` install scripts |

TypeScript end to end. The CLI and the backend share generated types from one OpenAPI spec, so a change to the API contract breaks the typecheck on both sides until it's handled.

---

## Repo layout

```
jukebox/
├── cli/                  Bun + citty
├── worker/               Hono on Cloudflare Workers
├── site/                 Next.js static export
├── schema/               OpenAPI spec + generated types
├── infra/                Exported zone config
├── docs/                 DESIGN.md, adr/
├── .github/workflows/    CI/CD
└── package.json          Bun workspaces root
```

Flat top level, one directory per concern.

`cli/`, `worker/`, and `site/` are the three deployable surfaces. Each has its own CI workflow with a path filter, so touching the landing page never redeploys the API.

`schema/` is the contract between client and server — both sides generate types from it, neither one owns it. Anything shared between the CLI and the worker goes here.

`infra/` holds exported zone-scoped config — the WAF and rate-limit rules read back from the API. It stays empty until those rules exist.

---

## Infrastructure

Everything runs on Cloudflare.

| Piece | Purpose |
|---|---|
| Workers | API + static site (two separate Workers) |
| D1 | Canonical tracks, sources, playlist membership |
| KV | Hot cache — most requests are served from here |
| Queues | Background matching and playlist refresh |
| Cron Triggers | Scheduled refresh on a fixed upstream budget |
| R2 | Database backups |

### Two Workers, not one

The API and the site deploy independently:

- `jukebox.dev` → site Worker (landing page, docs, `install.sh`, `discovery.json`, status)
- `api.jukebox.dev` → API Worker (D1, KV, Queues, cron)

The site hosts the install script and the discovery endpoint that every installed CLI reads on boot. Those must stay up even when the API is having a bad day, so they live on a separate deployment.

### Discovery endpoint

The API URL is **not** compiled into the binary. On boot, the CLI reads a static JSON file from the site:

```json
{
  "api": "https://api.jukebox.dev",
  "min_version": "0.4.0",
  "status": "ok",
  "message": null
}
```

This gives us three things: the ability to move the backend without breaking installed binaries, a version gate for breaking API changes, and a kill switch that shows users a real message during an outage instead of cryptic errors.

### Ownership split

Wrangler owns everything Worker-scoped — D1, KV, queues, R2 buckets, Worker code, bindings, routes, crons. Bindings are declared in `wrangler.jsonc`, and `wrangler deploy` provisions whatever is missing and writes the resource ids back into the config.

The dashboard owns the few zone-scoped rules — WAF and rate limiting — with their live config exported into `infra/`, so a change nobody wrote down still shows up as a git diff.

Bindings are non-inheritable, so staging and production are each declared in full. That is what keeps them identical.

---

## Key decisions

| Decision | Why |
|---|---|
| Client downloads directly from catalogs | No bandwidth cost; keeps hosting flat |
| Matching cached server-side, shared across users | Same work for everyone; cache hit rate approaches 100% |
| Scheduled refresh instead of on-demand fetch | Upstream API usage scales with playlists, not users |
| Delta sync with ETags | Most syncs return `304`, costing nothing |
| Bun over Go | `bun:sqlite`, and one language across CLI, API, and site |
| Cloudflare over Railway/VPS | Four services fit in one $5 plan; Railway bills each separately |
| Next.js static export, not SSR | Landing page needs no server; static assets are free |
| Two Workers, not one | Install script and discovery must survive an API outage |
| Wrangler over Terraform | Auto-provisioning covers every Worker resource; only WAF and rate limiting fall outside it |

---

## Later

- Additional playlist sources (Apple Music, YouTube)
- Crowd-sourced match corrections feeding the shared cache
- Public status page with live coverage stats
