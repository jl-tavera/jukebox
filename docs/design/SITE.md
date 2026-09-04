# Jukebox — Site

**Status:** draft · **Scope:** the site, not the product

## What this document is

`README.md` owns user-facing copy. `DESIGN.md` owns the mechanics of the product. This document owns the one deployable surface neither of them describes: the static site at `jukebox.dev`.

It exists because a landing page accumulates decisions that live nowhere else — a palette, a font stack, a contrast rule, a sentence someone rewrote three times — and those decisions get quietly reversed by the next person unless they are written down with their reasons.

| Document | Owns |
|---|---|
| `README.md` | Product framing, install, stack tables, roadmap. Source of truth for user-facing copy. |
| `CLAUDE.md` | Architecture invariants. Non-negotiable without an ADR. |
| `docs/design/DESIGN.md` | Mechanics: pipeline, schemas, protocol, scoring, failure modes. |
| **`docs/design/SITE.md`** | **The site: information architecture, design system, copy deck.** |
| `docs/adr/` | Individual decisions, with context and consequences. **Supersedes this document on conflict.** |

**This document still describes the page as it stands, and that page is being replaced.** The landing page becomes a live terminal, and ADR-0010 (`docs/adr/0010-the-landing-page-is-a-terminal.md`) records why — §01's brief, §02, §03's typeface and motion rules, §06's floor and §07's non-goals are all reversed by it. #92 rewrites those sections. Until it lands, read the ADR for the decision and this document for the page that is deployed.

### How to read the confidence markers

Same three markers `DESIGN.md` uses, for the same reason — a reader who cannot tell a constraint from a guess will treat the guess as a requirement:

- **Invariant** — derived from `CLAUDE.md` or `DESIGN.md`. Changing it breaks the availability model. Needs an ADR.
- **Proposed** — this document's own suggestion. Change it freely.
- **Open** — genuinely undecided. Listed in §08.

Design decisions here are mostly **Proposed**. The exceptions are marked, and they are the ones that matter.

---

## 01 · What the site is for

The site Worker serves six things. Four are built today.

| Artifact | Purpose | Built? |
|---|---|---|
| `/` | The landing page. Show what this is, hand over the install command. | yes |
| `install.sh` | What `curl \| sh` fetches. | yes — #38 |
| `install.ps1` | What `irm \| iex` fetches. Windows is the primary environment, so it is not an afterthought. | yes — #38 |
| `discovery.json` | Read by every installed CLI on boot. The API URL, `min_version`, kill switch. | yes |
| `/docs` | Longer-form usage. | no — §08 |
| `/status` | Coverage stats. Listed under `README.md` "Later". | no — §08 |

**The site and the API are separate Workers, and the site carries the fallback.** `install.sh` and `discovery.json` must stay reachable when `api.jukebox.dev` is entirely down, because `discovery.json` is where the outage message a human wrote gets read from. *(Invariant — `DESIGN.md` §07, `CLAUDE.md`.)*

The practical consequence for this surface: **static export only.** No SSR, no server components requiring a runtime, no route handlers, no server actions. A site that needs a running Next.js process to render is a site that can fail, and the whole reason it is a second Worker is that it must not. *(Invariant — `CLAUDE.md`.)*

**What `discovery.json` names today, and why that was allowed to ship.** §08 used to hold this artifact open, on the grounds that a document pointing at an API that does not exist would be worse than shipping none — a CLI reading it would resolve a dead host instead of failing at a clearly missing file. That bar is about *reachability*, not about which environment answers it, and the published document clears it: `api` names the staging API Worker, which is deployed and serving the contract's own error envelope. A CLI following it reaches a real API.

What the document does not yet name is a *stable* address, and that is the one thing it was never required to. The address being data rather than a compiled-in constant is the entire point of `DESIGN.md` §07 — moving it later costs one edited line and a deploy, with no client release and nothing to migrate. `min_version` is `0.1.0`, the first release, so the gate is exercised from the beginning rather than switched on once it already matters.

### What the landing page has to accomplish

Two things, in priority order:

1. **Hand over the install command.** A visitor who reads one line should leave with `curl -fsSL https://jukebox-site.joseluis64tavera.workers.dev/install.sh | sh`, or the PowerShell line beside it. Both are on the page rather than one: Windows is this project's primary environment, and a page publishing only the `curl` line excludes the visitor most likely to be reading it.
2. **Say what Jukebox is** in one sentence, in the register of the tool itself.

That is the whole brief. Explaining match coverage, the pipeline, and the non-goals is work the page does not currently do — see §08.

---

## 02 · Information architecture

One screen. No routes, no nav, no footer.

```
                                          [theme: light]



          ██╗██╗   ██╗██╗  ██╗███████╗██████╗  ██████╗ ██╗  ██╗
          ██║██║   ██║██║ ██╔╝██╔════╝██╔══██╗██╔═══██╗╚██╗██╔╝
          ██║██║   ██║█████╔╝ █████╗  ██████╔╝██║   ██║ ╚███╔╝
          ...

               Sync your playlists. Own your music.

            Jukebox is an open-source CLI that mirrors your
           public playlists and downloads the matching tracks
                       from open music libraries.

                         macos · linux
        $ curl -fsSL https://jukebox-site...../install.sh | sh  [copy]

                            windows
        > irm https://jukebox-site...../install.ps1 | iex      [copy]
                                █

                             [donate]
```

Centred, vertically and horizontally. Five elements and nothing around them.

The theme toggle is the single piece of chrome. It is there because dark and light are both first-class (§05) and a visitor with no control could only ever see whichever one their OS picked.

### The donate modal

`[donate]` sits under the cursor and opens a modal. At rest the page is unchanged, which is the point — a donation ask should be findable without being the first thing anyone reads.

```
  ┌──────────────────────────────────────────────┐
  │  support jukebox                    [close]  │
  │                                              │
  │  ┌────────────────────────────────────────┐  │
  │  │ example addresses — not live yet.      │  │
  │  │ these are deliberately invalid and     │  │
  │  │ every wallet will reject them.         │  │
  │  └────────────────────────────────────────┘  │
  │                                              │
  │  btc   bc1qEXAMPL…D0q4k9           [copy]    │
  │  eth   0xEXAMPLEo…funds0           [copy]    │
  │        also base · arbitrum · optimism ·     │
  │        polygon · usdc                        │
  │  sol   EXAMPLEonl…send0l           [copy]    │
  │        also usdc                             │
  │  xmr   4EXAMPLEon…000000           [copy]    │
  └──────────────────────────────────────────────┘
```

Native `<dialog>` opened with `showModal()`, not a hand-rolled overlay. Focus trapping, Escape to close, returning focus to the trigger, and making the rest of the page inert all come from the platform — and those are precisely the parts of a modal most often got wrong by hand. Padding lives on an inner wrapper so a click landing on the dialog element itself is unambiguously a backdrop click.

Two CSS constraints worth knowing before editing it: **no `display` utility may go on the dialog**, or its open/closed behaviour breaks; and `::backdrop` sits in the top layer where it cannot be relied on to inherit the theme custom properties, so its colour is a literal chosen to read over both grounds.

**Static addresses, not a hosted processor.** NOWPayments or Coinbase Commerce would cover more coins, but both mean a third-party script and a fee, and §07 says this page talks to nobody but Cloudflare. Four lines cover nearly everyone once the EVM row is an ENS name (one string for Ethereum, Base, Arbitrum, Optimism and Polygon) and the EVM and Solana rows accept USDC — which is what most people mean when they want to give a fixed amount rather than a volatile fraction of a coin. See §08 if that stops being enough.

**Not built, on purpose:** nav, footer, links, features, testimonials, comparison table, newsletter capture, analytics. The page is a hero and stops.

---

## 03 · Design system

### Palette — two colours that swap places

Yellow is the **ground**, not an accent. There is no third colour and no accent token, because when the whole page is yellow there is nothing left to accent.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ground` | `#ffd400` | `#0b0b0a` | Page background |
| `--ink` | `#0b0b0a` | `#ffd400` | Wordmark, headline, command |
| `--dim` | `#6b5b00` | `#a89000` | Secondary text, the `$` sigil, the two controls |

`--dim` is checked in both directions: `#6b5b00` on yellow ≈ 5.1:1, `#a89000` on black ≈ 5.4:1. Both clear AA. Selection inverts to `--ink` on `--ground`, the way a terminal selection does. The focus ring is `--ink`, which is full contrast in either theme by construction.

No literal hex belongs anywhere but `globals.css`. That is what keeps the two themes from drifting apart one component at a time.

### Typeface — the system monospace stack, and why

```
ui-monospace, "Cascadia Mono", "Segoe UI Mono", "SF Mono", Menlo,
Consolas, "DejaVu Sans Mono", monospace
```

No webfont. This is a decision with a reason, not a shortcut.

*Reversed by ADR-0010, once #81 lands. The failure described below is still the failure; what changes is that the coverage this argument assumes will be checked rather than taken on the font stack's word.*

The wordmark is built entirely from Block Elements — full, half and quarter blocks (`█ ▄ ▀ ▐ ▌`, U+2580–U+259F). `next/font` subsets Google fonts to `latin`; if those code points fall outside the subset, the browser substitutes them per-glyph from a fallback with different metrics and **the art shears apart** — and it does so silently, on someone else's machine. Every system monospace font ships the full Block Elements range, because terminals need it. Rendering in the visitor's own terminal font is therefore both the most literal reading of "terminal style" and the only way to guarantee the wordmark holds.

It also removes a whole class of failure: no font fetch, no layout shift, no build-time network dependency.

**If a webfont is ever introduced, the wordmark must be excluded from it** — or converted to SVG first.

### The wordmark

A blank row and then five lines, **byte-for-byte** from the banner at the top of `DESIGN.md`, held as a template literal in `site/lib/content.ts`. Two lines carry trailing spaces and three carry leading spaces; losing them shears the letterforms, which is why the constant is generated by script rather than retyped — hand-copying has already dropped them once. The extraction is fence-delimited, not line-numbered, so it survives the banner changing length.

The script is `cli/scripts/generate-wordmark.ts`, added by #60 and run as `bun run --cwd cli generate:wordmark`. It lives under `cli/` because a check spanning two workspaces has to run in one of them, and because `cli/tsconfig.json` typechecks it there. This section described it for some time before it existed; CI now regenerates both copies and runs `git diff --exit-code`, so the document is the source rather than a third copy naming itself as one.

Rendered in a `<pre>` with `role="img"` and `aria-label="Jukebox"`. The blank row is dropped at the render site: it is the CLI's, whose header is pinned to the top of a terminal, and a browser strips a newline immediately after a `<pre>` start tag in any case — so leaving it in would mean the served HTML and React's render disagreeing, which is a hydration mismatch rather than a blank line.

Sizing: the art is 67 characters wide. `font-size: clamp(5px, 2vw, 25px)` keeps it inside the viewport at every width — measured at 279px wide on a 375 viewport, 572px at 768, and 931px from 1250 up. `line-height: 1` so the half-blocks meet cleanly between rows.

*Those three widths were measured under the system monospace stack and are stale as of #81: Monaspace's advance is wider, so the art grew by roughly 6% at every width. The clamp still holds it inside the viewport and did not have to move. #83 re-measures all three in a real browser at 375, 768 and 1440 and is the ticket that should replace these numbers — deliberately not #81, which could only derive two of the three from the clamp rather than measure them.*

`letter-spacing: -0.03em` is not a styling choice. Adjacent block glyphs each rasterise in their own cell, and at fractional cell widths the boundaries leave sub-pixel gaps that let the ground bleed through the letterforms as vertical hairlines — clearly visible on the solid strokes this art is built from. A hair of negative tracking overlaps the cells and closes them. It is applied uniformly, so every row still measures identically and the integrity check below still means what it says.

**Changing the art means rechecking these numbers.** They are derived from its character width, and the previous wordmark was 58 wide — the clamp tuned for it overflowed a phone the moment a 67-wide one replaced it.

Block characters sit edge to edge, so subpixel antialiasing paints colour fringes along every internal seam. The `<pre>` forces grayscale antialiasing to remove them.

### Motion

One thing moves: a block cursor under the install command, `steps(1)` blink, wrapped in `@media (prefers-reduced-motion: no-preference)` so reduced motion gets a solid block rather than a degraded animation. Hover and focus may transition. Nothing else.

---

## 04 · Copy deck

Four strings. `README.md` is the source of truth for user-facing copy (`DESIGN.md` L22), so each is lifted verbatim rather than rewritten.

| Slot | String | Source |
|---|---|---|
| Wordmark | The ASCII `JUKEBOX` block | `DESIGN.md`'s first fence, byte-for-byte |
| Tagline | Sync your playlists. Own your music. | `README.md` L3, verbatim |
| Lede | Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries. | `README.md` L9, verbatim |
| Install (posix) | `curl -fsSL https://jukebox-site.joseluis64tavera.workers.dev/install.sh \| sh` | `README.md`, verbatim |
| Install (windows) | `irm https://jukebox-site.joseluis64tavera.workers.dev/install.ps1 \| iex` | `README.md`, verbatim |
| Platform labels | `macos · linux` · `windows` | new |
| Disclosure | `[donate]` / `[close]` | new |
| Support label | `support` | new |
| Chain rows | `btc` · `eth` · `sol` · `xmr`, plus `also base · arbitrum · optimism · polygon · usdc` and `also usdc` | new |
| Unset address | `not configured` | new — see §06 |

Two rules for anyone editing this later:

- **Changing a lifted string means changing `README.md` first.** The site is downstream. Divergence is how a project ends up with two conflicting descriptions of itself.
- **No claim the product cannot currently support.** No match-rate percentages, no user counts, no "works with any playlist". `DESIGN.md` §11 leaves the score thresholds open, so no number describing match quality can honestly appear here yet.

---

## 05 · Theming

Both themes are first-class. Neither is a filter applied to the other — they are the same two colours in opposite roles.

- **Mechanism:** `next-themes` with `attribute="class"`, `defaultTheme="system"`, and `suppressHydrationWarning` on `<html>`. Its script runs as the first executable node in `<body>`, before any visible content is parsed, which is what prevents a flash of the wrong theme on a statically exported page where the server cannot know the preference.
- **Tokens:** Tailwind v4 CSS-first. `@import "tailwindcss"`, a `dark` custom variant, and the §03 table declared once as CSS custom properties.
- **System default.** A visitor who has never chosen gets their OS preference. The toggle is three-state (system → light → dark), so "follow my system" stays reachable after someone touches it once.
- **Persistence:** `localStorage`, handled by `next-themes`. No cookie — a cookie would imply a server that reads it, and there isn't one.

---

## 06 · Quality floor

Not aspirations. A build that misses one of these is not finished.

| Check | Requirement |
|---|---|
| **Example addresses must be unsendable** | While `DONATIONS_ARE_EXAMPLES` is true, every address must break its own chain's encoding — mixed case in bech32, non-hex after `0x`, base58-excluded characters like `0`, `O`, `I`, `l`. A wallet then rejects them before a send can happen. A warning banner is not sufficient on its own; the value itself has to be unsendable. |
| **No copyable placeholder** | An address still wrapped in angle brackets renders `not configured` with **no copy button**. A wrong crypto address loses money permanently, so a donor must not be able to put one on their clipboard. |
| **Clipboard carries the full address** | Rows display a middle-truncated address; the copied value is always the complete string. Verify by capturing the argument to `clipboard.writeText`, not by eye. |
| **Wordmark integrity** | All five `<pre>` lines render at **identical width** at every viewport. Unequal widths mean a glyph fell back to another font. The banner's leading blank row is dropped before rendering, so it is not one of them. |
| Wordmark fit | `<pre>` never wraps and never overflows its box |
| Contrast | Body text ≥ 4.5:1 in **both** themes |
| Responsive | 375 / 768 / 1440 with no horizontal scroll |
| Keyboard | Both controls reachable, with a visible focus ring in both themes |
| Reduced motion | `prefers-reduced-motion: reduce` leaves a solid cursor |
| Theme flash | None, on hard reload, in either theme |
| **Discovery document published** | `out/discovery.json` exists and satisfies `DiscoveryDocument` from `schema/`. Checked by `bun run --cwd site check:discovery`, which reads the export rather than `public/` — a correct source file that never gets copied is a CLI that cannot boot. Run by CI and again by `deploy`, because the edit this file is most likely to receive is a kill switch flipped by hand, and that edit never opens a pull request. |
| Static export | `out/` is complete and serves standalone with no Next.js runtime |
| No webfont | `out/` contains no font files and the HTML preloads none |

The first is the one to actually measure rather than eyeball — a per-glyph font fallback can look almost right on the machine that built it and be obviously broken elsewhere.

---

## 07 · Non-goals

- **No analytics, no third-party scripts.** Nothing on this page needs a request to a party that is not Cloudflare. This is the rule that chose static wallet addresses over a hosted payment processor (§02) — a donation widget would have been the first thing to break it.
- **No SSR, no server components requiring a runtime, no route handlers.** *(Invariant.)*
- **No webfont.** See §03. If one arrives, the wordmark must be excluded from it. *(Reversed by ADR-0010, once #81 lands: one arrives, and the wordmark is not excluded from it.)*
- **No CMS.** Four strings do not need a content layer.
- **No dependency on the API.** The page renders identically when `api.jukebox.dev` is down, because it never calls it.
- **No component library sprawl.** There is no `components.json` and no `cn()` helper, because there are no shadcn components — a config file and a class-merging utility kept for a hypothetical future are two files that do nothing today. `shadcn init` regenerates both in one command the first time a component is genuinely wanted. `README.md`'s stack table still names shadcn/ui, and that stays true as intent.
- **No token without a consumer.** A palette entry or utility that nothing references is deleted, not left in place as a reservation. `--line` was carried for a while as "reserved for rules"; it was removed once it became clear nothing drew any.

---

## 08 · Open questions

**What comes back, and when.** The page currently says nothing about how matching works or that most tracks will not match. `DESIGN.md` L328 is clear that coverage should be presented as a property of the open catalogs rather than a bug, and a visitor who learns it after installing has a worse experience than one who learns it before. That belongs somewhere — a second section, a `/docs` page, or the install output itself. Deliberately deferred, not forgotten.

**Long-tail coins.** The four static rows cover the common cases, but a donor holding something unlisted has no route. A hosted processor (NOWPayments, Coinbase Commerce) would take 300+ coins and auto-convert, at the cost of a fee, an account, and the §07 no-third-party rule. Worth revisiting only if people actually ask — not before.

**An ENS name for the EVM row.** `jukebox.eth` would be one readable string covering five chains, where the alternative is a 42-character hex blob. Cheap, and it makes the best line on the list also the most legible.

**The domain is not ours.** `jukebox.dev` is registered to somebody else, so the site deploys to `jukebox-site.<account>.workers.dev` and that is where `discovery.json` and both installers are served from today. This is a naming decision rather than a technical one.

It used to be the last thing blocking the install command from being true, and it is not any more: #38 published the command against the address that actually answers. What changed with it is the cost of settling the domain. This document used to say that nothing else changes when it does — that the Worker gains one `custom_domain` route and the discovery document gains one edited line. **That is no longer true**, because a published install command is a string that has to be written down wherever anyone might read it. The workers.dev address now appears in:

| Where | What |
|---|---|
| `site/lib/content.ts` | `SITE`, which both install commands are built from |
| `README.md` | both install commands, and the note explaining the address |
| `docs/design/SITE.md` | §01, §02's wireframe, §04's copy deck — this document |
| `site/public/install.sh` | the usage comment at the top |
| `site/public/install.ps1` | the same |
| `.github/workflows/release.yml` | the release notes, and both `verify` jobs |
| `cli/src/discovery.ts` | `DISCOVERY_URL`, the one address compiled into the binary |

Only the last of those costs a client release; the rest are one commit. The alternative — holding the install command back until a domain exists — was the more expensive one, because it left the headline command in `README.md` untrue for everybody in the meantime. `app/layout.tsx`'s `metadataBase` and `openapi.yaml`'s server entry still name `jukebox.dev` and are the two places where doing so is harmless, because nothing resolves them.

**Docs route.** Whether `/docs` is MDX inside this app, a redirect to the GitHub README, or a separate surface.

**Status page.** `README.md` "Later" lists public coverage stats. It is the one page that would call the API, so it needs its own failure story.

**OG image and favicon.** The wordmark is the only mark the project has, and it is text rather than an image. An OG card would need it rendered to SVG or PNG at build time.
