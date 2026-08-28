# Jukebox

Open-source CLI that mirrors public playlists and downloads matching tracks from open music catalogs (Jamendo, Free Music Archive, Internet Archive, ccMixter, Musopen). Work splits three ways: **resolution** (playlist URL → normalized track list) and **matching** (track → catalog candidate) run on the backend; **fetching** (download, verify, organize, reconcile) runs on the client.

Spotify is the first playlist source. Apple Music and YouTube come later, so treat playlist sources as pluggable — never hardcode Spotify assumptions outside the source adapter.

## Architecture constraints

These are load-bearing. Breaking one undoes the cost or availability model, so treat them as invariants rather than preferences.

- **Audio bytes never pass through our infrastructure.** The CLI downloads directly from the catalog. Proxying or caching audio server-side introduces a bandwidth bill the project is designed not to have.
- **API credentials never ship in the binary.** Anything requiring a secret belongs in the Worker, not the CLI.
- **User requests never trigger an upstream playlist fetch.** A cron job refreshes tracked playlists on a fixed budget; the API only ever reads from cache. This keeps upstream API usage proportional to distinct playlists, not users.
- **The API URL is not compiled into the binary.** On boot the CLI reads `discovery.json` from the site. This is what allows moving the backend, gating breaking changes with `min_version`, and showing a real message during an outage.
- **Site and API are separate Workers.** The install script and discovery endpoint must stay reachable when the API is down. Never merge them into one deployment.
- **Sync is delta-based with ETags.** Most syncs should return `304` and cost nothing. Preserve conditional-request handling when touching sync.

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

Bun is chosen because `bun:sqlite` is built into the runtime — no native module, no install-time compilation, and it bundles into a standalone executable. Don't introduce a SQLite dependency that reintroduces native compilation.

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

Static export only — the landing page needs no server. Don't add SSR or server components that require a running Next.js runtime.

### Shared & ops

| | |
|---|---|
| Contract | OpenAPI spec → generated types for both sides |
| IaC | Terraform (Cloudflare provider) |
| CI/CD | GitHub Actions |
| Distribution | GitHub Releases + install script |

TypeScript end to end. CLI and backend generate types from one OpenAPI spec, so an API contract change breaks the typecheck on both sides until handled. That failure is intentional — don't route around it by hand-writing divergent types.

## Repo layout

```
jukebox/
├── cli/                  Bun + citty
├── worker/               Hono on Cloudflare Workers
├── site/                 Next.js static export
├── schema/               OpenAPI spec + generated types
├── infra/                Terraform
├── docs/                 DESIGN.md, adr/, agents/
├── .github/workflows/    CI/CD
└── package.json          Bun workspaces root
```

Flat top level, one directory per concern.

- `cli/`, `worker/`, `site/` are the three deployable surfaces. Each has its own CI workflow with a path filter, so touching the landing page never redeploys the API. When adding a workflow, keep the path filter.
- `schema/` is the contract between client and server. Both sides generate from it; neither owns it. Anything shared between CLI and worker goes here.
- `infra/` covers the whole system, not just the backend — DNS, buckets, and zone settings fronting the site as well as the API.

## Infrastructure

Everything runs on Cloudflare. Two Workers: `jukebox.dev` serves the site (landing page, docs, `install.sh`, `discovery.json`, status); `api.jukebox.dev` serves the API (D1, KV, Queues, cron). D1 holds canonical tracks, sources, and playlist membership; KV is the hot cache serving most requests; Queues handle background matching and playlist refresh; R2 holds Terraform state and database backups.

### Terraform vs Wrangler

A hard ownership boundary — check which side owns a resource before editing infra:

- **Terraform** owns what is created once: D1 database, KV namespace, queues, R2 buckets, DNS records, WAF and rate-limit rules.
- **Wrangler** owns what changes constantly: Worker code, bindings, routes, crons.

Staging and production are structurally identical: one module, two `.tfvars` files. Keep it that way — don't let the environments drift into separate modules.

## Key decisions

Already settled. Don't relitigate without an ADR.

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

## Agent skills

### Issue tracker

Issues live as GitHub issues in `jl-tavera/jukebox`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Further reading

- `README.md` — product framing, install instructions, roadmap. Source of truth for user-facing copy.
- `docs/design/DESIGN.md` — deeper design rationale.
- `docs/adr/` — architecture decision records. Read those touching your area before changing it.
