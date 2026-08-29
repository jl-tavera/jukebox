# Jukebox

Sync your playlists. Own your music.

---

## What it is

Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries.

You give it a playlist URL. It tracks the songs in that playlist and keeps a local folder in sync as the playlist changes — new tracks get downloaded, removed tracks get flagged.

Spotify first. Apple Music and YouTube later — the design treats playlist sources as pluggable from day one.

```bash
curl -fsSL https://jukebox.dev/install.sh | sh
jukebox add https://open.spotify.com/playlist/...
jukebox sync
```

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
| Distribution | GitHub Releases + `curl \| sh` |

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
- `--json` output for scripting and agent use
- Public status page with live coverage stats
