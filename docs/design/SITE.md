# Jukebox — Site

**Status:** draft · **Scope:** the site, not the product

## What this document is

`README.md` owns user-facing copy. `DESIGN.md` owns the mechanics of the product. This document owns the one deployable surface neither of them describes: the static site at `jukebox.dev`.

It exists because a landing page accumulates decisions that live nowhere else — a palette, a type scale, a contrast rule, a sentence someone rewrote three times — and those decisions get quietly reversed by the next person unless they are written down with their reasons.

| Document | Owns |
|---|---|
| `README.md` | Product framing, install, stack tables, roadmap. Source of truth for user-facing copy. |
| `CLAUDE.md` | Architecture invariants. Non-negotiable without an ADR. |
| `docs/design/DESIGN.md` | Mechanics: pipeline, schemas, protocol, scoring, failure modes. |
| **`docs/design/SITE.md`** | **The site: information architecture, design system, copy deck.** |
| `docs/adr/` | Individual decisions, with context and consequences. **Supersedes this document on conflict.** |

### How to read the confidence markers

Same three markers `DESIGN.md` uses, for the same reason — a reader who cannot tell a constraint from a guess will treat the guess as a requirement:

- **Invariant** — derived from `CLAUDE.md` or `DESIGN.md`. Changing it breaks the availability model. Needs an ADR.
- **Proposed** — this document's own suggestion. Change it freely.
- **Open** — genuinely undecided. Listed in §08.

Design decisions here are mostly **Proposed**. The two exceptions are marked, and they are the ones that matter.

---

## 01 · What the site is for

The site Worker serves five things. Only the first is built today.

| Artifact | Purpose | Built? |
|---|---|---|
| `/` | The landing page. Explain the tool, hand over the install command. | yes |
| `install.sh` | What `curl \| sh` fetches. | no — §08 |
| `discovery.json` | Read by every installed CLI on boot. The API URL, `min_version`, kill switch. | no — §08 |
| `/docs` | Longer-form usage. | no — §08 |
| `/status` | Coverage stats. Listed under `README.md` "Later". | no — §08 |

**The site and the API are separate Workers, and the site carries the fallback.** `install.sh` and `discovery.json` must stay reachable when `api.jukebox.dev` is entirely down, because `discovery.json` is where the outage message a human wrote gets read from. *(Invariant — `DESIGN.md` §07, `CLAUDE.md`.)*

The practical consequence for this surface: **static export only.** No SSR, no server components requiring a runtime, no route handlers, no server actions. A site that needs a running Next.js process to render is a site that can fail, and the whole reason it is a second Worker is that it must not. *(Invariant — `CLAUDE.md`.)*

### What the landing page has to accomplish

In priority order, because when they conflict the higher one wins:

1. **Hand over the install command.** A visitor who reads one line should leave with `curl -fsSL https://jukebox.dev/install.sh | sh`.
2. **Say what Jukebox actually does**, including the part that sounds like a limitation. It matches playlist entries to openly licensed equivalents. It is not a playlist downloader.
3. **Set the coverage expectation before install, not after.** Most tracks will not match. A user who learns this from the page is informed; a user who learns it from their first `jukebox sync` feels misled.

Point 3 is the unusual one and it is deliberate. `DESIGN.md` L328 states that coverage "should be presented to users as a property of the open catalogs, never as a bug in Jukebox". A landing page that buries this to look better converts more visitors into disappointed ones.

---

## 02 · Information architecture

One page, six blocks, no routes. Depth is a cost the project has not earned yet.

```
  +---------------------------------------------+
  | JUKEBOX          how it works · design · gh |  top bar + theme toggle
  +---------------------------------------------+
  |                                             |
  |  SYNC YOUR PLAYLISTS.                       |  hero
  |  OWN YOUR MUSIC.                            |
  |  <framing paragraph>                        |
  |  $ curl -fsSL … | sh              [copy]    |
  |                                             |
  +---------------------------------------------+
  |  THE MATCH LEDGER                           |  signature — §03
  |  # 01 …  ->  Jamendo …            exact     |
  |    02 …  ->  no open equivalent   none      |
  |  most tracks won't match. that's correct.   |
  +---------------------------------------------+
  |  HOW IT WORKS                               |  three concerns + catalogs
  +---------------------------------------------+
  |  WHAT IT ISN'T                              |  non-goals
  +---------------------------------------------+
  |  install line · github · license            |  footer
  +---------------------------------------------+
```

The ledger sits second, directly under the install command, because it is simultaneously the clearest explanation of the product and the honest disclosure from §01.3. Putting it above the fold means nobody installs without seeing a `none` row.

**Not built, on purpose:** a features grid, testimonials, a comparison table, a newsletter capture, an analytics script. Each would be a placeholder for something that does not exist yet.

---

## 03 · Design system

### Palette — yellow and black

Two hues. The restraint is the point: yellow-on-black is a common look, and what keeps it from reading as generic is that yellow is rationed rather than sprayed.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--ground` | `#0B0B0A` | `#FBFAF5` | Page background |
| `--surface` | `#141412` | `#FFFFFF` | Raised blocks, ledger rows |
| `--ink` | `#F4F3EE` | `#0B0B0A` | Body and headline text |
| `--muted` | `#8C8C84` | `#56564F` | Secondary text, `none` rows |
| `--rule` | `#232320` | `#E2E0D6` | Hairlines, borders |
| `--accent` | `#FFD400` | `#FFD400` | **Fill only** — bars, badges, `exact` rows |
| `--accent-ink` | `#FFD400` | `#7A6100` | Accent-coloured **text** |
| `--on-accent` | `#0B0B0A` | `#0B0B0A` | Text sitting on `--accent` |

**Why `--accent` and `--accent-ink` are two tokens.** `#FFD400` on `#FBFAF5` measures about 1.4:1. As text in light mode it is illegible, and a single token would make that mistake trivially easy to ship. Splitting them means yellow text in light mode is `#7A6100` (~5.5:1, AA) while yellow *fill* stays `#FFD400` with black on top (~12.5:1) in both themes. **The rule: in light mode, yellow is a surface, never a letterform.**

Yellow appears in exactly four places. Anything beyond this list is a regression:

1. The `exact` tier fill in the ledger.
2. The `probable` tier outline.
3. The `$` sigil and the copy affordance on the install command.
4. A 3px bar marking the hero and each section eyebrow.

### Typography

Loaded through `next/font/google`, self-hosted at build. Works under static export.

| Role | Face | Treatment |
|---|---|---|
| Display | Archivo (variable `wght`, `wdth`) | wght 800, wdth ~112 (expanded), tracking `-0.03em`, leading `0.9` |
| Section head | Archivo | wght 700, wdth 100, tracking `-0.02em` |
| Body / lede | Archivo | wght 400, leading `1.6` |
| Strip title | Archivo | wght 600, **wdth 85 (condensed)** — the ledger rows |
| Utility | IBM Plex Mono | uppercase, tracking `0.14em` — eyebrows, badges, positions, the install command |

Two families. Archivo's width axis does real work rather than decoration: the ledger rows are set condensed because a jukebox title strip is a narrow paper card and the type on it was always condensed to fit. The headline is set expanded against those narrow rows, so the two ends of one typeface carry the whole contrast.

### Scale and geometry

- **Type scale:** `clamp()` throughout. Hero `clamp(2.75rem, 9vw, 7rem)`; section heads `clamp(1.75rem, 4vw, 3rem)`; lede `clamp(1.05rem, 1.6vw, 1.375rem)`; body `1rem`; utility `0.75rem`.
- **Spacing:** 4px base unit. Section rhythm `clamp(4rem, 10vw, 8rem)` vertical.
- **Container:** `72rem` max, gutter `clamp(1.25rem, 5vw, 3rem)`.
- **Radius:** `2px`. Near-square, so blocks read as printed labels. Zero radius would land in broadsheet pastiche; pills would fight the industrial register.
- **Rules:** 1px `--rule` hairlines. The only thick rule is the 3px accent bar.

### Signature: the ledger, where tier is luminance

The hero block is the product's real output — a playlist entry on the left, its open-catalog match on the right, the tier on the far right. The four tiers from `DESIGN.md` §04 render as *how much light the row gets*:

| Tier | Treatment | Reads as |
|---|---|---|
| `exact` | Solid `--accent` fill, `--on-accent` text | Lit |
| `probable` | 1px `--accent` outline, no fill | Glowing at the edge |
| `weak` | 1px `--rule` outline, `--muted` text | Dim |
| `none` | No border, no fill, `--muted` text | Dark |

The ladder is confidence, and rendering it as brightness means the page shows exactly how much of a playlist actually resolves without needing a sentence to admit it. A visitor scanning the block sees mostly dark rows. That is the honest picture, and it is the design doing the disclosure rather than the copy.

The `nn` numbers are playlist position, taken from the organize template `{library}/{artist}/{album}/{nn} - {title}.{ext}` (`DESIGN.md` §06). They are data, not decorative `01 / 02 / 03` markers, which is the only reason they are there.

**The sample rows are fictional.** Invented titles and invented artists, held in `site/lib/content.ts`, and the block is labelled as an example. Real artists must never appear — the page would be implying a catalog relationship that does not exist, and the tiers would be asserting match quality for recordings nobody scored.

### Motion

One orchestrated moment and nothing else: ledger rows reveal in sequence on load, settling into their tier state. Pure CSS `animation-delay`, no JavaScript, wrapped in `@media (prefers-reduced-motion: no-preference)` so the reduced-motion path is the plain static render rather than a degraded animation.

Hover and focus states may transition. Nothing else on the page moves. **Proposed**, but the bar for adding a second animated element is that it explains something the static page does not.

---

## 04 · Copy deck

Every string, with its source. `README.md` is the source of truth for user-facing copy (`DESIGN.md` L22), so where a line exists there it is lifted verbatim rather than rewritten.

| Slot | String | Source |
|---|---|---|
| Title / hero | Sync your playlists. Own your music. | `README.md` L3, verbatim |
| Hero lede | Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries. | `README.md` L9, verbatim |
| Hero sub | You give it a playlist URL. It keeps a local folder in sync as the playlist changes — new tracks get downloaded, removed tracks get flagged. | `README.md` L11, condensed |
| Install | `curl -fsSL https://jukebox.dev/install.sh \| sh` | `README.md` L16, verbatim |
| Sources note | Spotify first. Apple Music and YouTube later. | `README.md` L13, condensed |
| Ledger eyebrow | Example — one playlist, resolved | new |
| Ledger caption | Most tracks won't match. That's not a bug — open catalogs don't contain commercial recordings, and Jukebox never pretends otherwise. | new, from `DESIGN.md` L328 |
| How it works | Resolution / Matching / Fetching → Backend / Backend / Client | `README.md` L27–31, verbatim |
| Bytes line | Bytes never pass through our infrastructure. | `README.md` L33, verbatim |
| Catalogs | Jamendo · Free Music Archive · Internet Archive · ccMixter · Musopen | `CLAUDE.md` L3, `DESIGN.md` L158 |
| Non-goals | Not a Spotify / Apple Music / YouTube downloader. · No DRM circumvention. · No accounts — the playlist URL is the identity. · No inflated match rates. | `DESIGN.md` §10, verbatim lead-ins |

Two rules for anyone editing this later:

- **Changing a lifted string means changing `README.md` first.** The site is downstream. Divergence between the two is how a project ends up with two conflicting descriptions of itself.
- **No claim the product cannot currently support.** No match-rate percentages, no user counts, no "works with any playlist". `DESIGN.md` §11 leaves the score thresholds open, so no number describing match quality can honestly appear on this page yet.

---

## 05 · Theming

Both themes are first-class. Neither is a filter applied to the other.

- **Mechanism:** `next-themes` with `attribute="class"`, `defaultTheme="system"`, and `suppressHydrationWarning` on `<html>`. Its inline script runs before paint, which is what prevents a flash of the wrong theme on a statically exported page where the server cannot know the preference.
- **Tokens:** Tailwind v4 CSS-first. `@import "tailwindcss"`, a `dark` custom variant, and the §03 table declared once as CSS custom properties. Components reference tokens only — **no literal hex outside `globals.css`**. This is what keeps the two themes from drifting apart one component at a time.
- **System default.** A visitor who has never chosen gets their OS preference. The toggle is a three-state control (system → light → dark) rather than a binary, so "follow my system" stays reachable after someone touches it once.
- **Persistence:** `localStorage`, handled by `next-themes`. No cookie — a cookie would imply a server that reads it, and there isn't one.

---

## 06 · Quality floor

Not aspirations. A build that misses one of these is not finished.

| Check | Requirement |
|---|---|
| Contrast | Body text and every tier treatment ≥ 4.5:1 in **both** themes |
| Yellow in light mode | Fill only. No yellow letterforms. §03 |
| Responsive | 375 / 768 / 1440 with no horizontal scroll |
| Keyboard | Every link, the toggle, and the copy button reachable, with a visible focus ring in both themes |
| Reduced motion | `prefers-reduced-motion: reduce` renders the static page, not a degraded animation |
| Theme flash | None, on hard reload, in either theme |
| Static export | `out/` is complete and serves standalone with no Next.js runtime |
| Client JS | Three client components only: theme provider, toggle, copy button |

The last two are the ones to actually verify rather than assume. A stray `"use client"` or a dynamic API is invisible in review and fatal to the §01 invariant.

---

## 07 · Non-goals

- **No analytics, no third-party scripts.** Nothing on this page needs a network request to a party that is not Cloudflare.
- **No SSR, no server components requiring a runtime, no route handlers.** *(Invariant.)*
- **No CMS.** Copy lives in `site/lib/content.ts` and in `README.md`. A landing page with eleven strings does not need a content layer.
- **No dependency on the API.** The page renders identically when `api.jukebox.dev` is down, because it never calls it. Live coverage stats belong to the future `/status` route, which may call the API and may therefore fail — that is exactly why it is a separate page.
- **No component library sprawl.** `components.json` and `cn()` exist so `shadcn add` works when something needs it. Today nothing does.

---

## 08 · Open questions

**`install.sh` hosting and contents.** The README already publishes the `curl | sh` line, so the URL is a commitment. The script itself needs a release to install and there are no releases. Blocks nothing on the landing page; blocks the page being truthful the moment anyone runs the command.

**`discovery.json`.** `DESIGN.md` §07 specifies the shape. Shipping one that points at an API that does not exist would be worse than shipping none — a CLI reading it would resolve a dead host instead of failing at a clearly missing file. Ships with the API.

**Docs route.** Whether `/docs` is MDX inside this app, a redirect to the GitHub README, or a separate surface. Redirecting is free and honest until there is more to say than the README holds.

**Status page.** `README.md` "Later" lists public coverage stats. It is the one page that would call the API, so it needs its own failure story.

**OG image and favicon.** The ASCII wordmark in `DESIGN.md` L3–10 is the only mark the project has. Whether it becomes the real logo, or is a placeholder for something drawn later, is undecided.

**Where the sample ledger data should come from.** Fictional rows are correct for launch. Once the corpus exists, real matches from a real public playlist would be more honest and more convincing — but they would also need to be regenerated at build time, which reintroduces a build-time API dependency this document has otherwise avoided.
