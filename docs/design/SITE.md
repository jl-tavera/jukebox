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

**The landing page is a live terminal, and ADR-0010 (`docs/adr/0010-the-landing-page-is-a-terminal.md`) records why it stopped being a one-screen hero.** This document describes the result. Where the two touch — the install guarantee that was traded, the no-webfont rule that was traded, the shape §06 grew afterwards — the ADR holds the case for the change, and this document records what replaced what. The decision is taken as settled here rather than re-argued.

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

Two things, in priority order. The second one is new.

1. **Hand over the install command.** A visitor who reads one screen and leaves should have it, and should not have had to type a word to get it. The page detects their system at boot and prints that one line with a control that copies it; the other two are one command away. Both installers still ship and both are still published: Windows is this project's primary environment, and a page offering only the `curl` line excludes the visitor most likely to be reading it.
2. **Show what Jukebox is, by being it.** Jukebox is a CLI, and the most characteristic thing in its world is its own startup — a bare `jukebox` prints a wordmark, a version line and an interactive menu. The page renders that startup and then lets the visitor type at it. This is the job the old page did not do at all: a visitor learned the shape of the tool only after installing it, which for a command-line tool is the whole of what they came for.

Two rules hold the second job honest, and both are constraints rather than descriptions of a first version.

**The page explains; it never simulates.** Real commands print their real help, generated at build time from the CLI's own command definitions (§04). Nothing invents a Resolution, a Tier or a Track count outside the one labelled recording.

**The binary's vocabulary and the site's are never dressed as each other.** Commands the binary owns sit at a `$ jukebox …` prompt; verbs only the page has sit at a `jukebox.dev ▸` prompt (§02). The menu carries the binary's own five entries and nothing else.

#### The one-line guarantee was traded, not kept

The old brief was that a visitor who reads one line leaves with the install command, and on a centred hero that was true by construction: the command was in the markup, at a fixed place, with nothing to run first. ADR-0010 gives that up deliberately and names three things that replace it — the boot puts the detected system's command on screen with a copy control and no typing, the finished session ships in the served HTML so a crawler, a screen reader, a browser whose JavaScript failed and a visitor with reduced motion all still get it, and all three commands stay reachable when detection guesses wrong.

What that does not restore is the guarantee. The command's presence is now a property of a build step and a boot sequence rather than of a static document, and a property of that kind has to be checked rather than assumed. §06's static-HTML floor is where it is checked.

---

## 02 · Information architecture

One screen still, and still no routes, no nav and no footer — but full-bleed, left-aligned, and wrapping at the viewport. A terminal centres nothing, so the wordmark sits top-left rather than in the middle of the page.

The page is two elements: a scrollback that scrolls with the document, and a status block pinned to the foot of the viewport at every scroll position.

### The scrollback, as it is served

This is the order `finished()` in `site/lib/session/index.ts` produces, and the order the served HTML carries:

```
# Sync your playlists. Own your music.
# Jukebox is an open-source CLI that mirrors your public playlists and
downloads the matching tracks from open music libraries.

# macos · linux
$ curl -fsSL https://jukebox-site...../install.sh | sh   copy
# Run `install` to choose another system.

$ jukebox

     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
     ███ ███   ███ ███  ▄██▀ ███      ███  ▐█▌ ███▀  ▀███  ▀█████▀
     ...
jukebox 0.1.0

│
◆  What next?
│  ● add (Track a playlist)
│  ○ sync
│  ○ list
│  ○ config
│  ○ quit
│  ↑/↓ to navigate • Enter: confirm
└
```

The order is the order a person would have seen it happen: two comments a human wrote, the command they typed, and then the binary's own output — quoted rather than described, everywhere it can be.

**The tagline and the lede are `#` shell comments.** A faithful boot has nowhere to put them: the binary's header is a blank row, the art, and a `jukebox <version>` line, with no description among them. `#` is the vernacular for *a human wrote this*, which is what both are. They are the only rows on the page that are neither a command nor a command's output.

**The install offer sits above the boot rather than below it**, for two reasons that agree. The replay in §03 starts at the `$ jukebox` line and works downwards, so the offer is on screen in the first frame rather than a second and a half later; and it could not sit below in any case, because the terminal reads its open question off the tail of the session, so the menu has to be last.

**A page served to nobody in particular carries the macOS line and only that one.** A static export cannot know who is reading it, and showing all three so that two can be taken away would put back the two-install-row problem the redesign existed to solve. The visitor's own system replaces it on hydration, from the same function, so what they see is byte-for-byte the page that system would have been served.

### The status block

Pinned below the scrollback, on screen at every scroll position and on every device:

```
jukebox.dev ▸ ▮
help  install  donate  theme  demo  clear
```

A live prompt, and a row of the page's own verbs. Below both sits a visually hidden `role="status"` region carrying the last output, so a command that did something says so to a screen reader.

**The chips are not buttons.** They are words the cursor lands on, which is what a chip is in a terminal (§03). They carry site verbs only; the menu carries the binary's commands. Keeping the split means each surface says something, rather than the two being redundant.

**The chip row is load-bearing, not decoration.** ADR-0010 deleted the corner theme toggle in favour of a `theme` command, and a command nobody can see is not a control. If the chips go, the theme control goes with them.

Tapping anywhere in the scrollback focuses the hidden field, so the software keyboard rises for anyone who wants to type. Chips are the primary path on touch; typing is the primary path with a physical keyboard; both work either way.

### Two vocabularies, two prompts

| Voice | Prompt | What sits at it |
|---|---|---|
| The binary | `$ jukebox ` | `add`, `config`, `list`, `remove`, `show`, `sync`, `version` |
| The page | `jukebox.dev ▸ ` | `help`, `install`, `donate`, `theme`, `demo`, `clear` |

Thirteen words are typeable and `help` lists all thirteen, under two headings. The separation is carried by **typeface as well as by prompt glyph** (§03) — with one face for both, a `jukebox.dev` line and a `$ jukebox` line differ at the left margin and nowhere else, and the separation is gone the moment a reader stops looking for it.

`jukebox.dev` here is *who is talking*, and is deliberately not the workers.dev address the install commands name. Those are two different facts (§08), and making them agree would put a fifty-character address in front of every prompt on the page.

### The menu is the binary's

Five entries — `add`, `sync`, `list`, `config`, `quit` — quoted from `cli/src/menu.ts` in the CLI's own order, which is not alphabetical: the two entries that reach the network, the two that read only local state, then the way out. Arrows move the selection, Enter selects, and `quit` closes the menu and lands at the free prompt, which is what `quit` means in the CLI. Selecting an entry prints that command's real help text.

Adding `install` or `donate` here would put site verbs in the binary's mouth, so neither is here.

**The rail's shape is reproduced exactly and its colour is not.** Two details decide whether the widget reads as a quotation or as an imitation: the hint appears on the **active row only**, and the block closes with a legend row and a corner rather than with its last option. The selected row is indicated by inversion. The prompt library the CLI uses paints its rail cyan and its radio green; those are the library's colours, and the CLI itself uses exactly one colour in the whole program, because a status has to survive `NO_COLOR`, a redirected stream and a terminal that has none. The shape is what identifies the widget, so the shape is what is copied. *(See §03 — no accent token was added.)*

### The prompt

Arrow keys recall history — newest first, stopping at the oldest rather than wrapping, giving back a half-typed line on the way down, and recording neither a blank line nor the same command twice running. Tab completes a command name, and completes the *argument* after a verb that takes one, so `theme l` reaches `light` rather than `list`.

**An ambiguous prefix completes to nothing**, which is a deliberate departure from bash: no longest-common-prefix, no candidate listing. The page has thirteen words and `help` lists them; a second listing mechanism would be a second thing to explain.

An unrecognised word answers the way a shell does — `jukebox.dev: command not found: <word>`, naming the word rather than the whole line, and pointing at `help`. A recognised command handed an argument it does not take names the verbs that do, in a sentence derived from them rather than written out.

The scrollback caps at 500 rows, and `clear` empties it. A real terminal keeps a thousand; each row here is DOM nodes rather than a line of a buffer, so half is the number.

### Donate is scrollback, not a modal

Typing `donate` prints a notice and then the wallet rows, each with a copy control, into the scrollback. The native `<dialog>` is deleted.

That dialog was chosen because focus trapping, Escape, returning focus to the trigger and making the rest of the page inert all arrive free from the platform, and those are precisely the parts of a modal most often got wrong by hand. It solved an overlay problem that no longer exists once there is no overlay, so those four go with it — and what replaces them is a requirement rather than a gift: **copy controls living in scrollback must stay reachable by keyboard with a visible focus state.** §06 checks it.

The rules about the *values* are untouched, because they were never about the container. They are §06's first three rows.

**Static addresses, not a hosted processor.** NOWPayments or Coinbase Commerce would cover more coins, but both mean a third-party script and a fee, and §07 says this page talks to nobody but Cloudflare. Four lines cover nearly everyone once the EVM row is an ENS name (one string for Ethereum, Base, Arbitrum, Optimism and Polygon) and the EVM and Solana rows accept USDC — which is what most people mean when they want to give a fixed amount rather than a volatile fraction of a coin. See §08 if that stops being enough.

### The rest of the command surface

- **`install`** opens a picker over macOS, Linux and Windows. **Choosing copies that command immediately** and says so plainly — and so does typing `install macos`, because a chosen row *runs the line a visitor could have typed*. The two are one gesture and cannot drift apart, which is what makes naming a system count as asking for the command. Auto-copy is scoped to this verb and to no other: everywhere else on the page a value reaches the clipboard only when a control is used. The command stays in the scrollback afterwards with its own copy control, so it can be copied again without re-running anything. There is no way out among the three rows, and that is not an oversight: any word naming no row closes the select on its way to being answered.
- **`theme`** moves between light, dark and system, and reports the current state (§05).
- **`demo`** plays one labelled recording in four beats — add a Playlist, Sync it, show its Tracks, then Sync again and get nothing changed. The fourth beat is the point: most syncs cost nothing, which is the most distinctive thing about the architecture and the reason this is a tool you keep running rather than one you run once. It is the only place on the page where fabricated output appears (§04).
- **`clear`** empties the scrollback. The chip row survives it, which is why the chips are not rows of the session.

**Not built, on purpose:** nav, footer, links, features, testimonials, comparison table, newsletter capture, analytics. The page is a terminal and stops.

---

## 03 · Design system

### Palette — two colours that swap places

Yellow is the **ground**, not an accent. There is no third colour and no accent token, because when the whole page is yellow there is nothing left to accent.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ground` | `#ffd400` | `#0b0b0a` | Page background, the status block's own ground, an inverted word's text |
| `--ink` | `#0b0b0a` | `#ffd400` | Body text, the caret, selection, an inverted word's ground |
| `--dim` | `#6b5b00` | `#a89000` | Menu hints, platform labels, secondary rows, the rail |

`--dim` is checked in both directions: `#6b5b00` on yellow ≈ 5.1:1, `#a89000` on black ≈ 5.4:1. Both clear AA. Selection inverts to `--ink` on `--ground`, the way a terminal selection does.

**The redesign added no colour.** The rail is drawn in these three, and the prompt library's cyan and green are not reproduced (§02).

No literal hex belongs anywhere but `globals.css`. That is what keeps the two themes from drifting apart one component at a time.

#### `--wash`, which is not a fourth colour

Hover lays a wash under a word, mixed from the two colours the page already has:

```css
--wash: color-mix(in oklab, var(--ink) 10%, var(--ground));
```

Mixed rather than declared, so it follows the theme for free and the palette is still two colours that swap places. Ten percent is a **ceiling rather than a preference**: §06 asks `--dim` to clear 4.5:1 over this wash, and in the light theme `--dim` on `--ground` is already about 5:1 with nothing to spare.

The `@supports` guard around it is written by hand rather than left to the compiler, and that is worth not undoing. Given the mix alone, the build emits a fallback of `var(--ink)` outside the guard it generates — read back out of `out/` to confirm, not assumed — so a browser without `color-mix` would paint ink on ink and erase the word under the cursor. Failing to no wash is recoverable; failing to an invisible word is not.

### The character grid

A terminal has two units and this page has the same two: one cell across, one line down.

| Token | Value | What it is |
|---|---|---|
| `--cell` | `clamp(0.8125rem, 0.65rem + 0.5vw, 0.9375rem)` | **The only text size on the page.** |
| `--line` | `1.5` | Leading. |
| `--row` | `calc(var(--cell) * var(--line))` | One row, as a length. |
| `--target` | `44px` | §06's touch target, as a token two rules and a Playwright helper all read. |

**Hierarchy carries no size scale.** It is a four-rung ladder — inverted, ink, prose, dim — and nothing in it changes size. The wordmark is the single exception, and it is art rather than text.

Horizontal offsets are whole character widths, written as spaces inside the row by the session module rather than as padding in a stylesheet nobody re-reads. The page's only inset is `1ch`. Tables reuse the CLI's own metrics: a two-space indent and a three-space gutter. Vertical gaps are zero or one line — the CLI never double-spaces — and a blank row is a real row with the height of one line rather than a margin.

A long row **wraps at the viewport** and continues at column zero, which is what a narrow terminal does. There is deliberately no hanging indent, because that would be a horizontal offset living somewhere other than in the string. Wrapping rather than truncating is the CLI's own rule: a long title cut off is a title a reader cannot search for.

### Every interactive element is a word the cursor lands on

The page has no button borders, no hover underlines, no pills and no focus rings. The block cursor is the only pointer: it becomes the selected menu row's inversion, sits on a focused chip, and sits on a hovered copy control.

**Hover washes; focus inverts.** Two different mechanisms rather than two shades of one, so a keyboard user can always find themselves and the difference survives on a screen that renders colour badly. The focus rule sits after the hover rule at equal specificity, so source order decides a word that is both — and focus is the one that must win.

Every cursor-landable word carries an invisible 44px target, and the two axes use two mechanisms for a reason easy to undo by accident. **Vertically** it is real padding on an `inline-block`, whose margin box participates in the line box — so the row grows, and rows growing is precisely what stops two neighbouring targets overlapping. A pseudo-element would leave the rows one line apart while every 44px box ate a third of its neighbour's, and a tap in the seam would run the wrong command; that is worse than a small target, not better. **Horizontally** it is an out-of-flow `::before`, because padding of half a cell would move every column to its right, and this page's whole claim is that a horizontal offset is a whole character written into the string.

### Typeface — the measured font gate

```
--font-mono:  "Monaspace Neon",  var(--font-fallback)    /* the machine */
--font-prose: "Monaspace Argon", var(--font-fallback)    /* the human   */
```

Neon is the page default and carries the wordmark, the commands, the output, the menu and the rail. Argon carries the tagline and lede, the chips, hints, the recording's asides and every other sentence the page wrote itself. **Monaspace is a superfamily built at identical metrics**, so the voice changes without the monospace grid moving a column — which is what makes §02's two vocabularies distinguishable before a word is read, and what makes these two faces not interchangeable with any other pair.

Both are vendored from the Monaspace `v1.400` release into `site/public/fonts/` and served from this origin. **No request leaves for a font CDN**, which is what keeps §07's no-third-party rule intact through a redesign that could easily have broken it.

**This section used to say "no webfont", and its reasoning was correct.** The wordmark is built entirely from Block Elements — full, half and quarter blocks, U+2580–U+259F. A default latin subset drops every one of them; the browser substitutes them per-glyph from a fallback with different metrics; and **the art shears apart** — silently, on someone else's machine rather than on the one that built the page. Nothing about that argument was wrong, and it is still the hazard. What changed is that the coverage it could only assume can now be demonstrated. ADR-0010 records the trade, including the part that is a genuine loss: the old rule could not fail, and two of the three things replacing it can.

Three things replace it:

1. **The subset whitelists explicitly.** `site/scripts/build-fonts.ts` instances the variable source down to the `wght` axis and subsets against an explicit unicode list — printable ASCII, the whole of Block Elements, Box Drawing and Geometric Shapes, and the singles the page draws outside all of them (`·`, `—`, `•`, `…`, `↑`, `↓`). Whitelisting those ranges *whole* rather than the glyphs the art happens to use is deliberate: the wordmark generator admits any code point in the Block Elements range by design, and the menu's legend sits outside all three ranges. The `.woff2` files are committed artifacts; the script reaches the network and shells out to fontTools, so it is run by hand and by nothing else.
2. **A check reads the built export.** `check:fonts` parses the cmap out of `out/fonts/*.woff2` and asserts every code point the page needs survived — on the same reasoning the discovery check already uses, that a correct source file which never gets copied is a wordmark that shears. Its required list is deliberately **not** imported from the subsetting script: that script's whitelist is the implementation and this list is the contract, and one shared list would let a narrowing narrow the check with it.
3. **A browser measures the rendered rows.** A code point present in a cmap is not proof of a correct advance width, and only something that renders can answer that. §06's wordmark row.

Two details keep the arrangement honest. `font-display: block` rather than `swap`, because swapping would paint the wordmark in fallback metrics first, which is the exact shear this all exists to prevent — and both faces are therefore preloaded, with `crossOrigin` set even though they are same-origin, since a font is fetched in CORS mode whatever its origin and a preload without it lands under a different cache key and downloads each face twice. `public/_headers` caches them for a week rather than a year, because the filenames carry no content hash and `immutable` would promise something this arrangement cannot keep: widen the whitelist to fix a missing glyph, and a returning visitor would keep the sheared copy until the entry expired.

The old system stack survives as `--font-fallback`, written once so the two voices cannot drift onto different grids:

```
ui-monospace, "Cascadia Mono", "Segoe UI Mono", "SF Mono", Menlo,
Consolas, "DejaVu Sans Mono", monospace
```

It is not vestigial. A face that fails to load degrades to exactly the page that shipped before the webfont, and every system monospace carries the full Block Elements range because terminals need it.

### The wordmark

A blank row and then five lines, **byte-for-byte** from the banner at the top of `DESIGN.md`, held as a template literal in `site/lib/content.ts`. Two lines carry trailing spaces and three carry leading spaces; losing them shears the letterforms, which is why the constant is generated by script rather than retyped — hand-copying has already dropped them once. The extraction is fence-delimited, not line-numbered, so it survives the banner changing length.

The script is `cli/scripts/generate-wordmark.ts`, added by #60 and run as `bun run --cwd cli generate:wordmark`. It lives under `cli/` because a check spanning two workspaces has to run in one of them. CI regenerates both copies and runs `git diff --exit-code`, so the document is the source rather than a third copy naming itself as one.

Rendered in a `<pre>` with `role="img"` and `aria-label="Jukebox"`. **The blank row is now a line of the session rather than being dropped at the render site** — the page is that terminal, so it wants the row for the same reason the CLI prints it. That also closes an old hazard: a browser swallows a newline immediately after a `<pre>` start tag, and the art handed to one no longer opens with one, so the served HTML and React's render agree byte for byte.

Sizing: the art is 67 characters wide. `font-size: clamp(5px, 2vw, 25px)` keeps it inside the viewport at every width — around 296px on a 375 viewport, 607px at 768, and 988px from 1250 up, measured in Chromium on Windows. `line-height: 1` so the half-blocks meet cleanly between rows.

**Those figures are approximate on purpose, and the reason is worth knowing.** The same page in Chromium on Linux measures about 33px narrower at 1440: platforms apply the `-0.03em` tracking across a run differently, so an exact number here would be a fact about one machine. #83 tried pinning them to within 2px and CI rejected all three on the first run.

`letter-spacing: -0.03em` is not a styling choice. Adjacent block glyphs each rasterise in their own cell, and at fractional cell widths the boundaries leave sub-pixel gaps that let the ground bleed through the letterforms as vertical hairlines — clearly visible on the solid strokes this art is built from. A hair of negative tracking overlaps the cells and closes them. It is applied uniformly, so every row still measures identically and §06's integrity check still means what it says.

Block characters sit edge to edge, so subpixel antialiasing paints colour fringes along every internal seam. The `<pre>` forces grayscale antialiasing to remove them.

The clamp was left exactly where it was when the typeface changed underneath it. The art grew about 6% when Monaspace arrived, whose advance is wider than the system stack these were first measured under; the clamp still held it inside the viewport and did not have to move. The accepted consequence: on a wide screen the art is wider than the text below it, which is what *the wordmark is the only exception, art at its own 67-column clamp* costs. **Changing the art means rechecking these numbers** — they are derived from its character width, and the previous wordmark was 58 wide.

Four things have to be true about the mark, and four different tools answer them. Keeping them separate is what stops any one being mistaken for the others:

| Question | Answered by |
|---|---|
| Is the art five rows of 67 columns, spaces and Block Elements only? | `generate-wordmark.ts`, regenerated and diffed in CI |
| Do the shipped faces still carry those code points after subsetting? | `check:fonts`, against `out/` |
| Did the renderer make five rows of it? | `e2e/wordmark.spec.ts` — a list of one is trivially equal to itself |
| Do the glyphs draw at the right advance width? | `e2e/wordmark.spec.ts` — the only one a browser can answer |

### Motion — two things, and nothing in CSS

**The stylesheet contains no animation, no transition and no `prefers-reduced-motion` block at all.** The old rule was *one thing moves: a block cursor, `steps(1)` blink*, and that cursor is gone with the page it sat under. Hover and focus are two static paints. `e2e/boot.spec.ts` sweeps every element for a running animation or a non-zero transition duration **with motion switched on**, which is the only configuration where asking means anything.

Two things move, both timed sequences declared as data by the session module and performed by one timer in the component:

- **The boot.** JavaScript clears the finished session and replays it: `jukebox` is typed a character at a time with jitter, a beat lands as if Enter had been pressed, then output arrives a row at a time. It completes in about 1.6 seconds against a 2.5 second cap, and the cap is the requirement rather than the figure. **The wordmark arrives row by row, never glyph by glyph** — 335 block characters typed one at a time would spend most of the budget rendering half-drawn rows that read as noise rather than as anticipation. The last frame hands back the array the finished session was built from, so the replay can only ever end exactly where the served HTML already was.
- **The recording.** `demo` prints its transcript and then plays it back, at three rates for three kinds of row: a command just entered, somebody talking, and output scrolling. It lands around 2.8 seconds against a 4 second cap.

Output **appears; it does not fade in**, and the page follows its own output by jumping rather than smooth-scrolling — a smooth scroll would be the one animation nobody asked for.

**The reduced-motion floor is content, never absence.** Under `prefers-reduced-motion: reduce` the boot does nothing at all, because the state already *is* the finished session; the recording is handed back whole, because the transcript is printed before the playback is declined. Turning off animation costs no rows. Two defaults err the same way: the reducer starts in reduced motion until the component affirmatively says otherwise, and a missing `matchMedia` reads as reduced.

Both replays are escapable. Any keypress or pointer press skips to the end, so a second visit does not make anyone watch it again — registered on the capture phase, because on the bubble phase the Enter that starts `demo` would immediately skip the recording it had just started.

---

## 04 · Copy deck

`README.md` is the source of truth for user-facing copy (`DESIGN.md` L22). What matters most about a string on this page is now **where it came from**, because two of the three groups below are generated and CI undoes an edit made by hand.

### Lifted verbatim from `README.md`

| Slot | String | Source |
|---|---|---|
| Tagline | Sync your playlists. Own your music. | `README.md` L3, verbatim |
| Lede | Jukebox is an open-source CLI that mirrors your public playlists and downloads the matching tracks from open music libraries. | `README.md` L9, verbatim |
| Install (posix) | `curl -fsSL https://jukebox-site.joseluis64tavera.workers.dev/install.sh \| sh` | `README.md`, verbatim |
| Install (windows) | `irm https://jukebox-site.joseluis64tavera.workers.dev/install.ps1 \| iex` | `README.md`, verbatim |

### Generated — never retyped, and CI diffs them

| Slot | Written from | By |
|---|---|---|
| The wordmark | `DESIGN.md`'s first fence | `bun run --cwd cli generate:wordmark` |
| The menu's question and its five entries | `WHAT_NEXT` and `ENTRIES` in `cli/src/menu.ts` | `bun run --cwd cli generate:help` |
| The binary's seven commands — description, usage line, arguments | the `meta` and `args` of each command under `cli/src/commands/` | the same |

All three land in `site/lib/content.ts`, and **an edit made there by hand is an edit CI will undo**: change the source, run the generator, commit what it wrote.

**Both checks run in the CLI's workflow rather than the site's** — once rather than twice, the split the schema checks already use. `cli.yml`'s path filter names `site/lib/content.ts` and `docs/design/DESIGN.md` as single files, so an edit to either still reaches the check.

The menu's hints and the commands' descriptions are **two quotations of two different screens** and must not be folded into one, however alike four of them look. `add` is three words in the menu and twelve in its help, because the two screens have different amounts of room and the CLI wrote for both.

### The page's own

The six verb summaries; the two prompts and the `#` comment sigil; the platform labels `macos · linux` and `windows`; `copy`; `not configured`; the examples notice; `Copied. Paste it into a terminal.`; the `command not found` sentence; the picker's question; the recording's opening and closing labels.

### Rules for anyone editing this later

- **Changing a lifted string means changing `README.md` first.** The site is downstream. Divergence is how a project ends up with two conflicting descriptions of itself.
- **No claim the product cannot currently support.** No match-rate percentages, no user counts, no "works with any playlist". `DESIGN.md` §11 leaves the score thresholds open, so no number describing match quality can honestly appear here yet. This bites in a small place worth knowing about: `demo` is summarised as *play a recording of a session* rather than *a real session*, because the recording prints a tier no build of `jukebox show` prints yet.
- **Registers follow the CLI's own.** Prose is sentence case with a terminal full stop; verbs, labels and statuses are lower case; hints are sentence case with no full stop; commands inside prose are wrapped in backticks. A generated description keeps the binary's register rather than being rewritten into the page's.

### The recording is the one exemption

`demo` is the only place on the page where fabricated output appears, and it is fenced on all sides. It is **labelled as a recording**, opening and closing, so an edge is findable in either direction. Every track and artist name is **invented** — putting real ones on a page about downloading from open catalogs invites precisely the wrong reading of what this tool does. At least one Track shows tier `none`, because a demo where everything matched is exactly the claim the rule above forbids, and because the honest coverage story is better met before installing than after. Everything printed uses `CONTEXT.md` vocabulary and the CLI's real output formats — statuses, tiers, counts, skips, timestamps, durations, unknown fields, and the markers for Tracks that arrived and left.

---

## 05 · Theming

Both themes are first-class. Neither is a filter applied to the other — they are the same two colours in opposite roles.

- **Mechanism:** `next-themes` with `attribute="class"`, `enableSystem`, `disableTransitionOnChange`, and `suppressHydrationWarning` on `<html>`. Its script runs before any visible content is parsed, which is what prevents a flash of the wrong theme on a statically exported page where the server cannot know the preference.
- **Tokens:** Tailwind v4 CSS-first. `@import "tailwindcss"`, a `dark` custom variant, and §03's tables declared once as CSS custom properties.
- **The control is a command, and has no chrome.** `theme light`, `theme dark` and `theme system` switch; a bare `theme` reports the current state and names the three. The corner toggle is deleted. A visitor who has never chosen gets their OS preference, and `system` stays reachable, so one switch does not permanently opt anyone out of following their OS.
- **One value, three readers.** `RESTING` in `lib/session/theme.ts` is the provider's default, the reducer's first state, and what a bare `theme` reports before the provider has answered. Three things have to agree about what a page nobody has chosen for is in; one constant is how they agree.
- **Discoverability is the chip row's job.** A command nobody can see is not a control (§02).
- **Persistence:** `localStorage`, handled by `next-themes`. No cookie — a cookie would imply a server that reads it, and there isn't one.

---

## 06 · Quality floor

Not aspirations. A build that misses one of these is not finished.

### The donation rules

| Check | Requirement |
|---|---|
| **Example addresses must be unsendable** | While `DONATIONS_ARE_EXAMPLES` is true, every address must break its own chain's encoding — mixed case in bech32, non-hex after `0x`, base58-excluded characters like `0`, `O`, `I`, `l`. A wallet then rejects them before a send can happen. A warning banner is not sufficient on its own; the value itself has to be unsendable. |
| **No copyable placeholder** | An address still wrapped in angle brackets renders `not configured` with **no copy button**. A wrong crypto address loses money permanently, so a donor must not be able to put one on their clipboard. |
| **Clipboard carries the full address** | Rows display a middle-truncated address; the copied value is always the complete string. Verify by capturing the argument to `clipboard.writeText`, not by eye. |

These three are unchanged by the move out of the modal, because they were never about the container. Two details in how they are met are worth not losing. The absence in the second is **structural**: no span carries a copy intent, so the renderer has no control to build and the reducer has nothing to hand over — not a disabled button. And the first is checked by a rule written out per chain rather than derived from the addresses, because a criterion computed from the value it is checking only asserts that the value is the value.

One requirement is new, and replaces what the native `<dialog>` used to give away free (§02): **copy controls in scrollback stay keyboard-reachable with a visible focus state**, and each is named individually — four rows carrying the word `copy` are four identical controls to anybody who cannot see which row the cursor is on. Printing the rows puts nothing on a clipboard; a page that copied four addresses because somebody typed `donate` would be doing the most damage this page is capable of, unasked.

### The page

| Check | Requirement |
|---|---|
| **Wordmark integrity** | All five rows of the `<pre>` render at **identical width** — a spread of exactly zero, not a tolerance — at 375, 768 and 1440, and in the faces this repo ships. Measured in Chromium, because a code point present in a subset's cmap is not proof of a correct advance width. A **negative case** serves a deliberately latin-only build of Neon and asserts the rows *do* disagree, which is what makes the equality assertion beside it mean anything; serving no face at all would not reproduce it, because every glyph would fall back together and the rows would stay equal. Row widths in pixels are deliberately **not** pinned — see §03. |
| **Webfont subset intact** | `out/fonts/*.woff2` are served from this origin, carry every code point the page draws, and are named by both a preload and a published stylesheet. Read from the export rather than `public/` — a correct source file that never gets copied is a wordmark that shears. |
| **No off-origin stylesheet fetch** | No published stylesheet fetches from any other origin. An allowlist of none rather than a blocklist of CDNs, because a blocklist is a check that passes on the CDN nobody thought of. This is the only machine check standing behind §07's no-third-party rule. |
| **Static-HTML floor** | With JavaScript disabled, the served page carries the version line, all five menu rows, the corner that closes the rail, the install command with its copy control, and the wordmark. This is what replaces the structural guarantee a server component used to give: a hydration gate, a clearing effect that runs before paint, or an `ssr: false` import would each remove the floor with nothing in the source looking any different. |
| **Focus is distinct from hover** | Focus, hover and rest are three different paints on every landable word, on the chips, on the copy controls and at the prompt — and focus inverts. Reached by keyboard in the check, never by clicking: Chromium does not apply `:focus-visible` to a clicked button, so a check that clicked would read the resting paint and pass while the requirement failed. |
| **44px touch targets** | Every landable word, every chip, every copy control and the prompt field answer across a 44px square. **Hit-tested rather than read off a box** — nine probes inside the square must each return the element or a descendant, which is what catches two targets overlapping rather than merely being large enough. |
| Touch target — the menu is the one exemption | Menu rows are deliberately **under** 44px and `e2e/menu.spec.ts` pins them there. Landable rows would push the rail's glyphs thirty pixels apart with nothing drawn between them — the vertical line the widget is identified by, pulled apart by its own tap targets — and `--dim` has no 4.5:1 headroom over the hover wash in the light theme. The menu is driven from the prompt and by arrow keys instead, and **the chips are the page's touch path** and do meet the floor. Recorded here rather than left as a silent deviation, because it contradicts the seam-3 list in #79. |
| **Contrast** | Body text ≥ 4.5:1 in **both** themes, at all three widths, **including over the hover wash and the focus inversion**. Measured by painting the computed colours into a canvas and reading the pixel back, not by parsing the serialised value — Chromium serialises the wash in `oklab`, and a regex over that reads a lightness of 0.8 as 0.8 units of red. |
| **The character grid** | Menu rows are one line tall; every menu row starts at the rail; no gap is ever two blank lines; no row contains a tab. |
| **No boxes** | No element on the page carries a border width, a border radius or a box shadow. |
| **Nothing else animates** | With motion switched on, no element runs an animation or carries a non-zero transition duration. The two replays are timer-driven and are not animations. |
| **The boot behaves** | It completes inside its cap, arrives whole, and reaches the end the moment a key is pressed — a tight timeout on that last one is the assertion. Under `prefers-reduced-motion: reduce`, every observed state of the page is the *finished* session, and the page is still live afterwards. |
| **The recording behaves** | The same three, against its own cap — plus a lower bound, because React appends its rows in several mutations even inside one commit, so "some sample was partial" would otherwise prove nothing. |
| Responsive | 375 / 768 / 1440 with no horizontal scroll — with `help` listed, with the menu's longest hint on screen, with five donation rows including the EVM note, and with the recording's widest row, which is 104 characters to the wordmark's 67. |
| **Theme flash** | None, on hard reload, in either theme, and **against a stored preference that disagrees with the system**. Measured as *how many rows had been parsed when the class landed* rather than by eye — a theme decided in a mount effect, or corrected after hydration, passes every weaker version of this check. |
| **Discovery document published** | `out/discovery.json` exists and satisfies `DiscoveryDocument` from `schema/`. Read from the export rather than `public/` — a correct source file that never gets copied is a CLI that cannot boot. |
| **Installers survive the export** | `out/install.sh` and `out/install.ps1` carry no carriage return, and `install.sh` opens with its shebang. A CRLF installer fails on its own first line for reasons that name no cause, and the export is built from the working tree rather than from git, so `.gitattributes` alone cannot guarantee what gets deployed. |
| Static export | `out/` is complete and serves standalone with no Next.js runtime |

### Where each of these runs

| Where | What |
|---|---|
| `site.yml` | Everything: four typecheck programs, the session module's tests, the jsdom wiring tests, then a build, then the three checks that read the export, then Playwright. The e2e step is last because it is slowest and needs `out/`, and it is the only step in this repo that installs a browser. |
| `deploy` | Re-runs `check:discovery`, `check:installers` and `check:fonts` before `wrangler deploy`, because the edit these files are most likely to receive is a kill switch flipped by hand, and that edit never opens a pull request. |
| `cli.yml` | The two generated-content diffs — the wordmark and the help text (§04). |

Three boundaries are worth not eroding. **Behaviour belongs to the session module's tests**, which run with no DOM and no browser; `tsconfig.test.json` compiles that module with no DOM lib at all, so reaching for `document` — or for `navigator.clipboard`, which hangs off it — fails to compile rather than failing review. **Wiring belongs to the jsdom layer** and is deliberately thin: that a copy intent reaches the clipboard API, that a keystroke arrives as an input, that focus lands where it was sent. **Only what needs pixels belongs to Playwright**, whose harness serves the export through `wrangler dev` rather than `next dev` — a font that never reached `out/` would render perfectly under the dev server, which is to say the harness would be unable to fail for the one reason it was built.

Wordmark integrity is the row to actually measure rather than eyeball — a per-glyph font fallback can look almost right on the machine that built it and be obviously broken elsewhere.

---

## 07 · Non-goals

- **No analytics, no third-party scripts, no third-party font.** Nothing on this page needs a request to a party that is not Cloudflare. This is the rule that chose static wallet addresses over a hosted payment processor (§02), and it is the rule the webfont was vendored to keep — a font CDN would have been the second thing to break it.
- **No SSR, no server components requiring a runtime, no route handlers.** *(Invariant.)*
- **No downloadable binaries.** The install command only. The install script does architecture detection and checksum verification that a browser cannot, and the long workers.dev URL is never rendered at full length as body text.
- **No simulating real commands.** Nothing on the page invents a Resolution, a Tier, a Track list or a match rate. The one labelled recording is the only place fabricated output appears (§04).
- **No named colour schemes, and no accent token.** Light, dark and system only. The palette is two colours that swap places; a third would have arrived with the rail, and did not (§03).
- **No CMS.** The page's own strings do not need a content layer, and the generated ones already have a source.
- **No dependency on the API.** The page renders identically when `api.jukebox.dev` is down, because it never calls it.
- **No component library sprawl.** There is no `components.json` and no `cn()` helper, because there are no shadcn components — a config file and a class-merging utility kept for a hypothetical future are two files that do nothing today. `shadcn init` regenerates both in one command the first time a component is genuinely wanted. `README.md`'s stack table still names shadcn/ui, and that stays true as intent.
- **No token without a consumer.** A palette entry or utility that nothing references is deleted, not left in place as a reservation. A `--line` was carried for a while as "reserved for rules" and removed once it became clear nothing drew any. The `--line` in §03 is a different token of the same name with two real consumers — `--row`, and the leading on `body` — which is the bar.

---

## 08 · Open questions

**What comes back, and when.** The page used to say nothing at all about how matching works, or that most tracks will not match. The recording now shows a Track that matched nothing, so the first honest sentence about coverage is on the page and a visitor meets it before installing rather than after. That is a start rather than an answer. `DESIGN.md` L328 is clear that coverage should be presented as a property of the open catalogs rather than a bug, and the fuller version of that still belongs somewhere — a `/docs` page, or the install output itself. Deliberately deferred, not forgotten.

**Three costs the floor does not catch.** Each is recorded in source today, and belongs here so that a reader of this document meets them too:

- **The boot is silent to a screen reader.** Most screen-reader users do not set a motion preference, so for them the session is removed and rebuilt under a virtual cursor over about a second and a half, with nothing announced — the live region is correctly silent until a command runs. Content leaves and returns with no explanation. The honest fix is a preference the page cannot see.
- **`donate`'s block announces as one run-together string**, including seventeen characters of a truncated address that is of no use read aloud. Marking the row hidden would take the value from a reader walking the scrollback, so neither option is right yet.
- **The recording can go stale against the CLI** and nothing will say so. It is a fixed transcript on purpose — generating it would mean the page ran the commands, which it does not — so the labelling is what keeps it honest, and the labelling at least does not expire.

**Long-tail coins.** The four static rows cover the common cases, but a donor holding something unlisted has no route. A hosted processor (NOWPayments, Coinbase Commerce) would take 300+ coins and auto-convert, at the cost of a fee, an account, and the §07 no-third-party rule. Worth revisiting only if people actually ask — not before.

**An ENS name for the EVM row.** `jukebox.eth` would be one readable string covering five chains, where the alternative is a 42-character hex blob. Cheap, and it makes the best line on the list also the most legible.

**The domain is not ours.** `jukebox.dev` is registered to somebody else, so the site deploys to `jukebox-site.<account>.workers.dev` and that is where `discovery.json` and both installers are served from today. This is a naming decision rather than a technical one.

It used to be the last thing blocking the install command from being true, and it is not any more: #38 published the command against the address that actually answers. What changed with it is the cost of settling the domain. This document used to say that nothing else changes when it does — that the Worker gains one `custom_domain` route and the discovery document gains one edited line. **That is no longer true**, because a published install command is a string that has to be written down wherever anyone might read it. The workers.dev address now appears in:

| Where | What |
|---|---|
| `site/lib/content.ts` | `SITE`, which both install commands are built from |
| `README.md` | both install commands, and the note explaining the address |
| `docs/design/SITE.md` | §04's copy deck — this document. §02's sketch elides it, deliberately: it is the longest thing on the page. |
| `site/public/install.sh` | the usage comment at the top |
| `site/public/install.ps1` | the same |
| `.github/workflows/release.yml` | the release notes, and both `verify` jobs |
| `cli/src/discovery.ts` | `DISCOVERY_URL`, the one address compiled into the binary |

Only the last of those costs a client release; the rest are one commit. The alternative — holding the install command back until a domain exists — was the more expensive one, because it left the headline command in `README.md` untrue for everybody in the meantime.

`HOST` in `site/lib/content.ts` already names `jukebox.dev` and is deliberately *not* `SITE`. It is who the page's own prompt speaks as rather than where its bytes come from (§02), so it does not change when the domain is settled and it must not be "fixed" to agree with the address above it. `app/layout.tsx`'s `metadataBase` and `openapi.yaml`'s server entry also name `jukebox.dev`, and are the two places where doing so is harmless, because nothing resolves them.

**Docs route.** Whether `/docs` is MDX inside this app, a redirect to the GitHub README, or a separate surface.

**Status page.** `README.md` "Later" lists public coverage stats. It is the one page that would call the API, so it needs its own failure story.

**OG image and favicon.** The wordmark is the only mark the project has, and it is text rather than an image. An OG card would need it rendered to SVG or PNG at build time.
