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

**The landing page is a live terminal running a real bash, and ADR-0011 (`docs/adr/0011-the-terminal-is-bash.md`) records what that retired.** ADR-0010 (`docs/adr/0010-the-landing-page-is-a-terminal.md`) records why the page stopped being a one-screen hero and is superseded by it, from a notice at its own head, so a reader arriving at the old one is not misled. This document describes the result. Where they touch — the install guarantee that was traded, the no-webfont rule that was traded, the two rules that have since been narrowed, the shape §06 grew and then lost — the ADRs hold the case for the change and this document records what replaced what. The decisions are taken as settled here rather than re-argued.

### How to read the confidence markers

Same three markers `DESIGN.md` uses, for the same reason — a reader who cannot tell a constraint from a guess will treat the guess as a requirement:

- **Invariant** — derived from `CLAUDE.md` or `DESIGN.md`. Changing it breaks the availability model. Needs an ADR.
- **Proposed** — this document's own suggestion. Change it freely.
- **Open** — genuinely undecided. Listed in §08.

Design decisions here are mostly **Proposed**. The exceptions are marked, and they are the ones that matter.

Since #114 the third marker does real work in §06 as well as in §08. A quality-floor row marked **Open** is one this document still asks for and nothing currently checks — which is a different thing from a row that was retired, and the two are not to be conflated when reading that table.

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

1. **Hand over the install command.** `install` with a system named copies that command immediately; `install` on its own prints the three rows to choose from; and the chip row is what makes the verb visible to somebody with no keyboard. Both installers still ship and both are still published: Windows is this project's primary environment, and a page offering only the `curl` line excludes the visitor most likely to be reading it. **The old form of this job is not met.** *(Open — §08.)* It read *a visitor who reads one screen and leaves should have it, and should not have had to type a word to get it*, and today the handover costs one typed word or one tap: the greeting detects nothing, offers nothing and carries no copy control, and `guessed()` in `lib/session/install.ts` survives with no caller outside its own tests. ADR-0011 records it as the largest of this migration's costs, and nothing checks it.
2. **Show what Jukebox is, by being it.** Jukebox is a CLI, and the most characteristic thing in its world is its own startup — a bare `jukebox` prints a wordmark, a version line and an interactive menu. The page renders that startup and then lets the visitor type at it. This is the job the old page did not do at all: a visitor learned the shape of the tool only after installing it, which for a command-line tool is the whole of what they came for.

Two rules hold the second job honest, and both are constraints rather than descriptions of a first version.

**Nothing the page prints as a command's own output was written by the page.** Real commands print their real help, generated from the CLI's own command definitions and diffed in CI (§04). This is the narrower survivor of a rule that used to read *the page explains; it never simulates*, and the half that went is the filesystem: `lib/session/machine.ts` seeds an invented Library and Mirror that an ordinary `cat` reaches, with no label round any of it (§07). What replaces the label is a check rather than a marker — `test/machine.test.ts` reads `CONTEXT.md` and holds every domain word in those records to the glossary in both directions, so a term used must be one the glossary grants and no synonym it avoids may appear. ADR-0011 holds the argument.

**Each voice is still limited in what it may say.** Nothing typographic carries the split any more and there is one prompt where there were two (§02, §03). What carries it is `lib/session/shell.ts`'s division of labour: `greeting()` may speak as the page, and `started()` prints only what the binary prints, so the tagline and the lede belong to the greeting and to nothing a command can produce. The menu still carries the binary's own five entries and nothing else. `PROMPTS`, `echoed()` and `ARROW` survive in `lib/session/commands.ts` and in its tests and paint nothing — worth knowing before believing them.

#### The one-line guarantee was traded, and what replaced it did not survive either

The old brief was that a visitor who reads one line leaves with the install command, and on a centred hero that was true by construction: the command was in the markup, at a fixed place, with nothing to run first. ADR-0010 gave that up deliberately and named three things replacing it. None of the three survives as written.

- **The detected system's command on screen, with a copy control and no typing.** Gone, and the most completely: nothing on the page reads a user agent, so there is no detection at all.
- **The finished session in the served HTML**, so that a crawler, a screen reader, a browser whose JavaScript failed and a visitor with reduced motion all still met a page. Gone. A terminal emulator needs WebAssembly and real text measurement, and a build machine has neither, so the session is composed in the browser. `out/index.html`'s rendered body is the theme script and the chip row: no terminal, no wordmark, no version line, no install command as content. The command's *bytes* are in the document, inside the React flight payload's inline `<script>` along with both installers, `discovery.json` and `README.md` — unrendered rather than absent, and invisible to anything that extracts text. The tagline and lede still reach a crawler through `<title>` and the description meta tag.
- **All three commands reachable when detection guesses wrong.** Survives with its premise removed: all three are reachable through `install`, and there is no detection to guess wrong.

So the guarantee is not weakened but absent, **and nothing checks its absence** *(Open — §08)*. §06's static-HTML floor was where it was checked, and that row is retired with the floor.

What came back instead is different in kind and is worth more than it sounds. `lib/published.ts` reads both installers, the discovery document and `README.md` off disk at prerender, so the shell hands a visitor the exact bytes the site serves rather than a transcription of them — and `e2e/files.spec.ts` proves it by running `sha256sum` *inside the shell* against a digest of what the Worker served. A visitor can verify an installer before running it, which the hero could never have offered.

---

## 02 · Information architecture

One screen still, and still no routes, no nav and no footer — but full-bleed, left-aligned, and wrapping at the viewport. A terminal centres nothing, so the wordmark sits top-left rather than in the middle of the page.

The page is two elements, and that frame is more literal than it used to be: a terminal emulator (`components/live.tsx` mounting `@wterm/react`'s grid) and a status block pinned to the foot of the viewport. The emulator owns its own overflow and virtualises the rows outside it, so **the document does not scroll at all** — the status block is sticky to a page that never moves, which is why it is still where it was. **The chip row is the only real DOM the page draws.** Everything else is a character in a grid.

### The greeting, as it is written

`greeting()` in `lib/session/shell.ts` composes this once, when the shell attaches, against the column count measured at boot. It is static text by necessity: `BashShell` builds its `Bash` lazily inside `attach`, so at the moment the greeting is written no command the page owns exists yet, and a greeting is what the page says before anybody has asked it anything.

```
# Sync your playlists. Own your music.
# Jukebox is an open-source CLI that mirrors your public playlists and
downloads the matching tracks from open music libraries.

     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
     ...
jukebox 0.1.0

What next?
  add      Track a playlist
  sync     Ask every playlist what changed
  list     Every playlist you track
  config   Every setting, where it came from, and change one
  quit     Leave the menu

user@wterm:~$
```

The order is the order a person would have seen it happen: two comments a human wrote, and then the binary's own output — quoted rather than described, everywhere it can be. What is no longer in it, and was in every earlier version of this section, is an install offer above the boot (§01).

**The tagline and the lede are `#` shell comments.** A faithful boot has nowhere to put them: the binary's header is a blank row, the art, and a `jukebox <version>` line, with no description among them. `#` is the vernacular for *a human wrote this*, which is what both are. They are the only rows on the page that are neither a command nor a command's output.

**The mark is conditional on width.** Below the art's natural 67 columns the wordmark is dropped and the version line stands alone, which is the same trade `cli/src/header.ts` makes in a narrow terminal and the reason the art is not simply left to wrap. Measured: 375 gives 44 columns, 768 gives 84, 1440 gives 152 — so a phone's only mark is the string `jukebox 0.1.0`. §03 carries the mechanism.

**The five menu entries are text, and every one of them runs.** They are quoted from `cli/src/menu.ts` in the CLI's own order, which is not alphabetical — the two entries that reach the network, the two that read only local state, then the way out — and `install` and `donate` are deliberately absent, because putting site verbs in the binary's mouth is the thing §01's second rule forbids. They are drawn by `table()` through the same indent-and-gutter metrics every other table on this page uses. There is no widget: no rail, no cursor, no radio, no legend row. **What replaces the gesture is that the label *is* the command** — each of the five is registered in the shell, and `e2e/files.spec.ts` holds that by running all five and asserting none of them is a `command not found`.

**The page has a filesystem, and it is the strongest surviving form of *the page explains*.** `lib/published.ts` seeds both installers, `discovery.json` and `README.md` into `$HOME` at prerender, so `cat install.sh` shows a visitor the bytes the site serves before they decide to pipe them into a shell, and `sha256sum` lets them check it. `lib/session/machine.ts` seeds the rest: an invented Library at `~/Music/Jukebox` and an invented Mirror at `~/jukebox/data/mirror`, with `JUKEBOX_HOME` set in the shell's environment so a visitor who wonders why that folder exists can run `env` and be told. The invention is §07's one exemption and it carries no label; `test/machine.test.ts` is what fences it instead.

Two things about the shell's answers are still the page's own rather than bash's:

- **The not-found sentence.** `reworded()` rewrites bash's own message on the stream into `notFound()`'s two rows — `jukebox.dev: command not found: <word>`, naming the word rather than the whole line, and pointing at `help`. Rewriting on the way out rather than intercepting on the way in is what keeps bash the thing that decides whether a word is a command. It is the one brittle line in that module, and it is brittle in the safe direction: a wording change upstream stops the rewrite firing and the visitor gets bash's sentence.
- **`clear`.** Shadowed rather than inherited, because `just-bash`'s bundle carries no escape sequences at all, so `shell.ts` writes `\x1b[H\x1b[2J\x1b[3J` itself. The `3J` is the point — without it the scrollback is still there to be scrolled back into.

### The status block

Pinned below the terminal, on screen at every scroll position and on every device:

```
help  install  donate  theme  clear
```

**Five chips, derived rather than listed.** `CHIPS` is every command whose voice is the page's, minus any marked unchipped, so a binary command cannot reach this row without somebody first claiming in `VERBS` that it is one of the page's own. `demo` came and went the same way. `quit` is typeable and is deliberately not here, and the `Command` that says so says it beside the word rather than in a list that would go stale.

**The chips are `<button>`s with none of a button's appearance.** That is the honest element for a word that runs something; `globals.css` strips the chrome and a `::before` gives it a 44px target the text is too short to provide (§03). They carry site verbs only; the menu carries the binary's commands. Running one goes through the same `handleInput` a keystroke does, so the line echoes at the prompt and enters exactly as if it had been typed — there is one way a command reaches bash and this is it.

**The chip row is load-bearing, not decoration.** ADR-0010 deleted the corner theme toggle in favour of a `theme` command, and a command nobody can see is not a control. Since #112 it carries more than that: it is the only focusable element on the page and the whole of the touch-target, focus-state and contrast floors (§06). If the chips go, the theme control goes with them and so does the last thing a finger can hit.

**There is no live region.** The visually hidden `role="status"` block that used to sit under both is deleted, and the emulator ships nothing in its place, so **nothing announces what a command printed**. §08 carries the cost.

Tapping the terminal focuses the emulator's own input — an `aria-hidden` textarea it consumes keystrokes from — so the software keyboard rises for anyone who wants to type. Chips are the primary path on touch; typing is the primary path with a physical keyboard; both work either way. **`Escape` is the way back out**, bound in the capture phase by `live.tsx` because the emulator focuses itself on load and consumes `Tab` for completion. Without it the page is a keyboard trap (§06).

### One shell, and where the split went

| Voice | Prompt | What sits at it |
|---|---|---|
| One shell | `user@wterm:~$ ` | all fourteen of the page's own words — the binary's eight commands and the page's six verbs — plus whatever else `just-bash` answers |

The prompt is the library's default, not the page's, because `live.tsx` passes no `prompt` option. The separation of the two voices is no longer typographic (§03) and no longer two prompts, and what carries it now is which voice is allowed to say what: `greeting()` speaks as the page, `started()` prints only what the binary prints. `help` still lists the page's fourteen words under two headings, and the headings now group by *whose answer you are about to get*. The menu's five entries are not a sixth category to add to that count: four of them are among the binary's eight and `quit` is among the page's six, which is what makes each of them typeable in the first place.

`jukebox.dev` survives as *who is talking* in the page's own error sentences, and is deliberately not the workers.dev address the install commands name. Those are two different facts (§08), and making them agree would put a fifty-character address in front of every prompt on the page. Since the two prompts went, `HOST` reaches only strings — one step further from a screen than it was — so it is more rather than less likely to be "fixed" by mistake.

### Donate is scrollback, not a modal

Typing `donate` prints a notice and then the wallet rows into the scrollback. The native `<dialog>` is deleted.

That dialog was chosen because focus trapping, Escape, returning focus to the trigger and making the rest of the page inert all arrive free from the platform, and those are precisely the parts of a modal most often got wrong by hand. It solved an overlay problem that no longer exists once there is no overlay, so those four go with it — and ADR-0010 replaced them with a requirement rather than a gift: copy controls living in scrollback must stay reachable by keyboard with a visible focus state.

**That requirement is vacuous, and worse than unmet.** There are no copy controls. The command returns no copy intents — correctly, since an intent is performed on arrival and four would put four addresses on a clipboard for the act of printing the block — and the serialiser discards the copy field by design. So each configured row prints the literal word `copy` with nothing behind it: the page shows a control that does not exist. A visitor who cannot use a mouse can read the addresses and select one by hand, and has nothing to tab to. §06 retires the row and §08 carries the three ways out.

The rules about the *values* are untouched, because they were never about the container. They are §06's first three rows.

**Static addresses, not a hosted processor.** NOWPayments or Coinbase Commerce would cover more coins, but both mean a third-party script and a fee, and §07 says this page talks to nobody but Cloudflare. Four lines cover nearly everyone once the EVM row is an ENS name (one string for Ethereum, Base, Arbitrum, Optimism and Polygon) and the EVM and Solana rows accept USDC — which is what most people mean when they want to give a fixed amount rather than a volatile fraction of a coin. See §08 if that stops being enough.

### The rest of the command surface

- **`install`** prints three rows — macOS, Linux, Windows — and the visitor types one. **Naming a system copies that command immediately** and says so plainly, because a named row *is* the line a visitor could have typed, so the two are one gesture and cannot drift apart. Auto-copy is scoped to this verb and to no other. The command stays in the scrollback afterwards, though only as text: it can be selected, not re-copied from a control. There is no way out among the three rows, and that is not an oversight — any word naming no row is answered rather than swallowed.
- **`theme`** moves between light, dark and system, and reports the current state (§05).
- **`clear`** empties the scrollback. The chip row survives it, which is why the chips are not rows of the session — and since #112 that is the whole reason the row survived at all.
- **`quit`** is typeable and unchipped. It answers rather than doing anything, because there is nothing to leave.

**Not built, on purpose:** nav, footer, links, features, testimonials, comparison table, newsletter capture, analytics. The page is a terminal and stops.

---

## 03 · Design system

### Palette — two colours that swap places

Yellow is the **ground**, not an accent. There is no third colour and no accent token in anything this repo paints, because when the whole page is yellow there is nothing left to accent.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ground` | `#ffd400` | `#0b0b0a` | Page background, the status block's own ground, an inverted word's text |
| `--ink` | `#0b0b0a` | `#ffd400` | Body text, the caret, selection, an inverted word's ground |
| `--dim` | `#6b5b00` | `#a89000` | Menu hints, platform labels, secondary rows, the rail |

`--dim` is checked in both directions: `#6b5b00` on yellow ≈ 5.1:1, `#a89000` on black ≈ 5.4:1. Both clear AA. Selection inverts to `--ink` on `--ground`, the way a terminal selection does.

**The redesign added no colour, and then the emulator did.** *(Open — §08.)* Nothing this repo paints uses a fourth: `globals.css`'s `.wterm` bridge re-declares `--term-bg`, `--term-fg`, `--term-cursor` and `--term-color-8` in the three tokens above. It stops there, so `--term-color-2` and `--term-color-4` arrive from `@wterm/dom`'s own sheet as `#6a9955` and `#569cd6`, and `@wterm/just-bash`'s default prompt paints `user@wterm` in the first and the working directory in the second. **The page draws a green and a blue on every prompt row**, and neither will clear §06's 4.5:1 against the yellow ground. Two more lines in the bridge would settle it; ADR-0011 records why it is a cost here rather than a fix, and §06 asks for the measurement rather than a calculation.

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
| `--target` | `44px` | §06's touch target, read by `.u-word`, by `.u-chips > .u-word`, and — as a duplicated constant, because a stylesheet cannot export one — by `e2e/harness.ts`. |

**Hierarchy carries no size scale.** It is a four-rung ladder — inverted, ink, prose, dim — and nothing in it changes size. The wordmark is the single exception, and it is art rather than text.

Horizontal offsets are whole character widths, written as spaces inside the row by the session module rather than as padding in a stylesheet nobody re-reads. The page's only inset is `1ch` — and `globals.css` overrides the emulator's own pixel padding to `var(--row) 1ch` for exactly that reason, which is the one place the renderer was made to obey this rule rather than the other way round. Tables reuse the CLI's own metrics: a two-space indent and a three-space gutter, and there are three of them on this page in one shape. Vertical gaps are zero or one line — the CLI never double-spaces — and a blank row is a real row with the height of one line rather than a margin.

A long row **wraps at the viewport** and continues at column zero, which is what a narrow terminal does. There is deliberately no hanging indent, because that would be a horizontal offset living somewhere other than in the string. Wrapping rather than truncating is the CLI's own rule: a long title cut off is a title a reader cannot search for. The wrapping is the emulator's own now rather than the browser's, which makes it a real question of the grid rather than an inherited one: a column count measured wrong runs a long row off the side instead of reflowing it, which is why §06 asks about horizontal scroll at three widths.

### The one interactive element is a word the cursor lands on

The page has no button borders, no hover underlines, no pills and no focus rings. The block cursor is the only pointer, and since #112 there is one place for it to be: a chip. Landable words in the scrollback, the copy controls and the prompt field were all DOM the emulator replaced with characters, so the rules below have exactly five subjects. That is a narrowing of their reach and not of the rules themselves — §06 still holds every one of them, against the chip row.

**Hover washes; focus inverts.** Two different mechanisms rather than two shades of one, so a keyboard user can always find themselves and the difference survives on a screen that renders colour badly. The focus rule sits after the hover rule at equal specificity, so source order decides a word that is both — and focus is the one that must win.

Every cursor-landable word carries an invisible 44px target, and the two axes use two mechanisms for a reason easy to undo by accident. **Vertically** it is real padding on an `inline-block`, whose margin box participates in the line box — so the row grows, and rows growing is precisely what stops two neighbouring targets overlapping. A pseudo-element would leave the rows one line apart while every 44px box ate a third of its neighbour's, and a tap in the seam would run the wrong command; that is worse than a small target, not better. **Horizontally** it is an out-of-flow `::before`, because padding of half a cell would move every column to its right, and this page's whole claim is that a horizontal offset is a whole character written into the string.

On the chip row the horizontal axis is settled by a real `min-width` instead, and the `::before` resolves to `100%` and reaches nothing extra — a status line has no columns to its right to push. The vertical mechanism is doing the work it was designed for either way.

### Typeface — one face paints, and two are shipped

```
--font-mono:  "Monaspace Neon",  var(--font-fallback)    /* the machine */
--font-prose: "Monaspace Argon", var(--font-fallback)    /* the human   */
```

**The two-face split is retired. The two files are not.** *(Open — §08.)* Neon is the page default and carries everything the terminal draws, which since #112 is everything except five buttons. Argon was to carry the tagline, lede, chips, hints and every other sentence the page wrote itself — **and it paints nothing at all.** `.u-prose` sets it on the chips and `.u-word` sets `font: inherit` in the same `@layer components`, at equal specificity and later in source order, so the family is reset before it lands. `e2e/wordmark.spec.ts` records this rather than asserting around it: `document.fonts` reports Argon `unloaded` on a fully painted page, and the spec measures one face.

The deeper reason is not that one rule beat another. A terminal renders every cell in one family, so the split's whole subject — commands, output, the menu, the rail — became a grid with nowhere for a second voice to go. What carries the separation now is which voice may say what (§02).

**Monaspace is a superfamily built at identical metrics**, which is why the pair was chosen and why they were not interchangeable with any other; that argument is intact and unused. Both are still vendored from the Monaspace `v1.400` release into `site/public/fonts/` and served from this origin. **No request leaves for a font CDN**, which is what keeps §07's no-third-party rule intact through two redesigns that could easily have broken it.

The accepted cost, stated rather than absorbed: `check:fonts` holds **both** faces to the full required code-point list *and* asserts the page asks for both, so CI actively enforces shipping and preloading a face that draws nothing. §07's rule against a token with no consumer points straight at it. Deleting Argon touches the subsetting script, the check, the preload, the stylesheet and `public/_headers`, and restoring the split instead is a design decision nobody has asked for — so §08 carries both and this section decides neither.

**This section used to say "no webfont", and its reasoning was correct.** The wordmark is built entirely from Block Elements — full, half and quarter blocks, U+2580–U+259F. A default latin subset drops every one of them; the browser substitutes them per-glyph from a fallback with different metrics; and **the art shears apart** — silently, on someone else's machine rather than on the one that built the page. Nothing about that argument was wrong. ADR-0010 records the trade and named three things replacing the guarantee, and ADR-0011 records what happened next: **the hazard itself is now unreachable on this page**, because the emulator paints those cells instead of typesetting them. The third item below is retired for that reason rather than for neglect, and the argument still holds for `cli/src/header.ts`, which draws the same art in a real terminal out of the same subset.

Three things replaced it. Two still stand:

1. **The subset whitelists explicitly.** `site/scripts/build-fonts.ts` instances the variable source down to the `wght` axis and subsets against an explicit unicode list — printable ASCII, the whole of Block Elements, Box Drawing and Geometric Shapes, and the singles the page draws outside all of them (`·`, `—`, `•`, `…`, `↑`, `↓`). Whitelisting those ranges *whole* rather than the glyphs the art happens to use is deliberate: the wordmark generator admits any code point in the Block Elements range by design, and the menu's legend sits outside all three ranges. The `.woff2` files are committed artifacts; the script reaches the network and shells out to fontTools, so it is run by hand and by nothing else.
2. **A check reads the built export.** `check:fonts` parses the cmap out of `out/fonts/*.woff2` and asserts every code point the page needs survived — on the same reasoning the discovery check already uses, that a correct source file which never gets copied is a wordmark that shears. Its required list is deliberately **not** imported from the subsetting script: that script's whitelist is the implementation and this list is the contract, and one shared list would let a narrowing narrow the check with it.
3. ~~**A browser measures the rendered rows.**~~ **Retired by #112, because the failure it watched for cannot happen here any more.** A code point present in a cmap is not proof of a correct advance width, and only something that renders could answer that — but `@wterm/dom` intercepts U+2580–U+259F before any text run is flushed and paints each cell as a CSS gradient in a `1ch` box, so the font is never asked for a block glyph and a face that dropped the range cannot shear the art. What a browser measures instead is the lattice: the columns the blocks land on (§06). Two consequences follow and both matter elsewhere — the art never appears in `textContent`, so a screen reader meets nothing where the mark is (§08), and it can only be measured as geometry.

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

**There is no wordmark element.** The art is written into the emulator as five rows of bytes, and the terminal's grid sizes it: one cell per character, at the page's one text size, with no clamp, no tracking and no `<pre>` of its own. Every sizing figure this section used to carry — a `font-size` clamp, three measured pixel widths, a platform delta, a negative letter-spacing, a grayscale-antialiasing rule — described that element and went with it. The blank row above the mark survives as a line of the session, which is what the CLI prints and therefore what the page prints.

**Its integrity is conditional where it used to be measured.** `NATURAL` in `lib/session/shell.ts` is derived off the art rather than written down — the longest row of `WORDMARK`, which is 67 — and `started()` prints the mark when the emulator's column count clears it and a bare `jukebox <version>` line when it does not. Below the threshold there is no smaller art: `cli/src/header.ts` falls back to the word `JUKEBOX` in a narrow terminal, and the page falls back to a version string, so **a phone's only mark is the string `jukebox 0.1.0`.** Measured: 375 gives 44 columns, 768 gives 84, 1440 gives 152.

**Changing the art still means rechecking**, and what to recheck has moved. The number is derived in one place and remembered in two — `cli/src/header.ts` and `cli/scripts/generate-wordmark.ts` both write 67 as a literal — with a generator and a `git diff --exit-code` that fail if the art moves. What no longer needs rechecking is a pixel: nothing about the mark's size is a fact about one machine any more.

**The greeting is composed once, against the width measured at boot**, which is the mark's remaining live hazard. A window narrowed afterwards reflows the scrollback under art already written, and the emulator cannot put back what no longer fits — measured, a grid taken below the art turns 67 columns into 50. That is the red case §06's lattice check uses, and it is a real failure rather than a contrived one. The reason the branch can be trusted at all is a bug it shipped with: `wt.cols` is the constructor's default of 80 when `onReady` fires, because the emulator's own `ResizeObserver` delivers after `init()` resolves, so a 375 viewport cleared 67, took the wide branch and painted art truncated mid-row at column 43. `live.tsx` observes the element itself, after the emulator's observer, and that is what makes the count real.

Four things have to be true about the mark, and four different tools answer them. Keeping them separate is what stops any one being mistaken for the others — the questions have changed and the discipline has not:

| Question | Answered by |
|---|---|
| Is the art five rows of 67 columns, spaces and Block Elements only? | `generate-wordmark.ts`, regenerated and diffed in CI |
| Do the shipped faces still carry those code points after subsetting? | `check:fonts`, against `out/` — for `cli/src/header.ts`'s sake now, not the page's |
| Does the greeting pick the right branch for a column count? | `test/shell.test.ts`, with no browser in the room |
| Did the blocks land on the columns the source puts them on? | `e2e/wordmark.spec.ts` — the only one a browser can answer |

### Motion — one thing, and nothing in CSS

**`globals.css` contains no animation, no transition and no `prefers-reduced-motion` block at all.** Hover and focus are two static paints.

**One thing moves, and it is the emulator's.** A block cursor blinks: `@wterm/dom` animates it, and `live.tsx` reads `prefers-reduced-motion` once, when the terminal is constructed, and passes the answer to `cursorBlink`. So the media query is asked in TypeScript rather than in CSS — and that is the architecture rather than an exception to it, because the terminal is not rendered at all until the question has been answered. A terminal mounted before it was asked would blink at somebody who asked it not to and never stop. A missing `matchMedia` reads as reduced.

The two timed replays this section used to describe are gone. The boot that typed `jukebox` a character at a time and the `demo` recording that played back a transcript were both deleted with the session module that declared them, along with the skip-on-any-keypress handling they needed. Nothing replaced them, and nothing on the page now waits on a timer.

Output **appears; it does not fade in**, and the page follows its own output by jumping rather than smooth-scrolling — a smooth scroll would be the one animation nobody asked for. The emulator does the jumping now.

**The reduced-motion floor is content, never absence** — and it is now trivially met for a different reason than it used to be. There is nothing timed to withhold, so the only difference reduced motion makes is a cursor that holds still. Turning off animation costs no rows because there are no rows that arrive late.

**Nothing checks any of this.** *(Open — §08.)* The sweep that enforced the no-motion rule lived in `e2e/boot.spec.ts` and went with the boot replay it was written for. It cannot simply be restored where it was: `playwright.config.ts` asks every project for reduced motion so that a colour can be read at a stable phase, which is the one configuration in which the question means nothing — so *reduced motion disables the blink* is asserted nowhere either. Closing both needs a second Playwright project at `no-preference` running one sweep, which is a change to the harness rather than a line in a spec, and is left to a ticket that makes it.

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
| The binary's eight commands — description, usage line, arguments | the `meta` and `args` of each command under `cli/src/commands/` | the same |

All three land in `site/lib/content.ts`, and **an edit made there by hand is an edit CI will undo**: change the source, run the generator, commit what it wrote.

**Both checks run in the CLI's workflow rather than the site's** — once rather than twice, the split the schema checks already use. `cli.yml`'s path filter names `site/lib/content.ts` and `docs/design/DESIGN.md` as single files, so an edit to either still reaches the check.

The menu's hints and the commands' descriptions are **two quotations of two different screens** and must not be folded into one, however alike four of them look. `add` is three words in the menu and twelve in its help, because the two screens have different amounts of room and the CLI wrote for both.

### The page's own

The six verb summaries; the `#` comment sigil; the platform labels `macos · linux` and `windows`; `not configured`; the examples notice; `Copied. Paste it into a terminal.`; the `command not found` sentence; the picker's question. The prompt is no longer among them — the one on screen is the emulator's (§02). `copy` is still printed and no longer means anything, which §02 and §06 both record.

Everything in `lib/session/machine.ts` is also the page's own, and it is the exception to how this section reads: those strings are neither lifted nor generated. §07 is where that exemption is stated and `test/machine.test.ts` is what bounds it.

### Rules for anyone editing this later

- **Changing a lifted string means changing `README.md` first.** The site is downstream. Divergence is how a project ends up with two conflicting descriptions of itself.
- **No claim the product cannot currently support.** No match-rate percentages, no user counts, no "works with any playlist". `DESIGN.md` §11 leaves the score thresholds open, so no number describing match quality can honestly appear here yet. **The page currently breaks this rule, in one column.** `machine.ts` prints a `TIER` heading and four tier values, and nothing in `cli/`, `worker/` or `schema/` implements a Tier — `cli/src/commands/show.ts` prints six columns with the last unnamed. The glossary check cannot object, because `CONTEXT.md` grants the word. ADR-0011 records it; §08 carries when it can go.
- **Registers follow the CLI's own.** Prose is sentence case with a terminal full stop; verbs, labels and statuses are lower case; hints are sentence case with no full stop; commands inside prose are wrapped in backticks. A generated description keeps the binary's register rather than being rewritten into the page's.

### The filesystem is the one exemption, and it carries no label

`lib/session/machine.ts` is the only place on the page where fabricated content appears. The exemption it replaced was fenced: `demo` was **labelled as a recording**, opening and closing, so an edge was findable in either direction. #112 deleted the recording, and #113 put the invention somewhere a label cannot go — a Library of Playlist folders and a Mirror recording what is in them, reached by an ordinary `cat`. **A label brackets a transcript, and a file has no opening or closing beat to bracket.**

What is unchanged is everything the recording's rules were actually about. Every Playlist, Track, artist and album name is **invented** — putting real ones on a page about downloading from open catalogs invites precisely the wrong reading of what this tool does. At least one Track shows tier `none`, because a Mirror where everything matched is exactly the claim the rule above forbids, and because the honest coverage story is better met before installing than after. Everything printed uses `CONTEXT.md` vocabulary and the CLI's real output formats — statuses, tiers, counts, skips, timestamps, durations, unknown fields, and the markers for Tracks that arrived and left.

**What replaces the fence is a check rather than a reviewer.** `test/machine.test.ts` reads `CONTEXT.md` and holds every domain word in those records to the glossary in both directions: a term used must be one the glossary grants, and no synonym the glossary avoids may appear at all. Two limits belong beside that credit. It subtracts the invented names before testing, so it says nothing about whether they are apt — only that no undeclared domain term slipped in. And it passes on `TIER`, because the glossary grants the word and no surface implements one.

---

## 05 · Theming

Both themes are first-class. Neither is a filter applied to the other — they are the same two colours in opposite roles.

- **Mechanism:** `next-themes` with `attribute="class"`, `enableSystem`, `disableTransitionOnChange`, and `suppressHydrationWarning` on `<html>`. Its script runs before any visible content is parsed, which is what prevents a flash of the wrong theme on a statically exported page where the server cannot know the preference.
- **Tokens:** Tailwind v4 CSS-first. `@import "tailwindcss"`, a `dark` custom variant, and §03's tables declared once as CSS custom properties.
- **The control is a command, and has no chrome.** `theme light`, `theme dark` and `theme system` switch; a bare `theme` reports the current state and names the three. The corner toggle is deleted. A visitor who has never chosen gets their OS preference, and `system` stays reachable, so one switch does not permanently opt anyone out of following their OS.
- **One value, two readers.** `RESTING` in `lib/session/theme.ts` is the provider's default and what a bare `theme` reports before the provider has answered. It had a third — the reducer's first state — and the reducer is gone. Two things still have to agree about what a page nobody has chosen for is in; one constant is how they agree.
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
| ~~**Clipboard carries the full address**~~ | **Retired by #112, with the control it was about.** It read: rows display a middle-truncated address, the copied value is always the complete string, verified by capturing the argument to `clipboard.writeText` rather than by eye. Nothing can be copied out of the donate block now, so there is no value to be the wrong one. The rule itself is not abandoned — it is checked where it is still reachable, over `install`'s copy, against a real clipboard in `e2e/install.spec.ts`. |

The first two are unchanged by the move out of the modal, because they were never about the container. Two details in how they are met are worth not losing. The absence in the second is **structural**: no span carries a copy intent that anything performs, so there is no control to build — not a disabled button. And the first is checked by a rule written out per chain rather than derived from the addresses, because a criterion computed from the value it is checking only asserts that the value is the value.

~~One requirement was new, and replaced what the native `<dialog>` used to give away free (§02): **copy controls in scrollback stay keyboard-reachable with a visible focus state**, each named individually, because four rows carrying the word `copy` are four identical controls to anybody who cannot see which row the cursor is on.~~

**That requirement is vacuous since #112, and the page is worse than merely not meeting it.** *(Open — §08 carries the three ways out.)* There are no copy controls. The command returns no copy intents — correctly, since a page that put four addresses on a clipboard for the act of printing them would be doing the most damage it is capable of, unasked — and the serialiser discards the copy field by design. So **each configured row prints the word `copy` with nothing behind it**: the page shows a control that does not exist. A visitor who cannot use a mouse can read the addresses and select one by hand, and has nothing to tab to.

### The page

| Check | Requirement |
|---|---|
| **Wordmark integrity** | The blocks land on the columns `WORDMARK` puts them on, at every width where the grid clears the art's natural 67 — and where it does not, the plain version line stands in the art's place and **that absence is the assertion**. Row count is asserted separately, because four rows landing correctly is still four rows. Measured as a lattice of columns rather than as row widths, because `@wterm/dom` paints the blocks and never asks the font for one, so there is no glyph to be missing and no advance to be wrong (§03). The **negative case** is a grid taken below the art's width after the greeting was composed, not a latin-only face: a painted cell does not consult the font, so the old fixture reproduces nothing. Row widths in pixels are deliberately **not** pinned, and now for a stronger reason — nothing about the mark's size is a fact about one machine. |
| **Webfont subset intact** | `out/fonts/*.woff2` are served from this origin, carry every code point the page draws, and are named by both a preload and a published stylesheet. Read from the export rather than `public/` — a correct source file that never gets copied is a wordmark that shears. Since #112 this earns its keep for `cli/src/header.ts`, which draws the same art in a real terminal, rather than for the page. It holds **both** faces, including the one that paints nothing (§03). |
| **No off-origin stylesheet fetch** | No published stylesheet fetches from any other origin. An allowlist of none rather than a blocklist of CDNs, because a blocklist is a check that passes on the CDN nobody thought of. Part of `check:fonts` rather than a browser check, and — with `check:wasm` below — what stands behind §07's no-third-party rule. |
| ~~**Static-HTML floor**~~ | **Retired by #112, and its reason is worth keeping precisely because the floor is gone.** It read: with JavaScript disabled, the served page carries the version line, all five menu rows, the corner that closes the rail, the install command with its copy control, and the wordmark — *"this is what replaces the structural guarantee a server component used to give: a hydration gate, a clearing effect that runs before paint, or an `ssr: false` import would each remove the floor with nothing in the source looking any different."* What removed it was none of those three and could not have been caught by watching for them: a terminal emulator needs WebAssembly and real text measurement, and a build machine has neither. `out/index.html`'s rendered body is the theme script and the chip row — five buttons that do nothing without JavaScript. §01 records the count this leaves ADR-0010's three replacements at, and nothing checks the absence. *(Open — §08.)* |
| **Focus is distinct from hover** | Focus, hover and rest are three different paints on every chip — and focus inverts. Reached by keyboard in the check, never by clicking: Chromium does not apply `:focus-visible` to a clicked button, so a check that clicked would read the resting paint and pass while the requirement failed. **Reached by `Escape` since #112**, not by `Tab`: the emulator focuses itself on load and consumes `Tab` for completion, so `live.tsx` binds `Escape` to hand focus to the chip row. Without it the page is a keyboard trap. |
| **44px touch targets** | Every chip answers across a 44px square. **Hit-tested rather than read off a box** — nine probes inside the square must each return the element or a descendant, which is what catches two targets overlapping rather than merely being large enough. *Since #112 the chips are the whole of it*: landable words, copy controls and the prompt field were DOM the emulator replaced with text, so a grid of characters is what stands where they were. |
| ~~Touch target — the menu is the one exemption~~ | **Retired by #112, along with the widget it excused.** Menu rows were deliberately under 44px and `e2e/menu.spec.ts` pinned them there, because landable rows would have pulled the rail's glyphs thirty pixels apart — the vertical line the widget was identified by, broken by its own tap targets — and `--dim` has no 4.5:1 headroom over the hover wash in the light theme. The menu is no longer a widget: its five entries are text, typed rather than tapped, so there is no row to exempt and no rail to pull apart. **The chips are the page's only touch path** and they meet the floor. |
| **Contrast** | Body text ≥ 4.5:1 in **both** themes, at all three widths, **including over the hover wash and the focus inversion**. Measured by painting the computed colours into a canvas and reading the pixel back, not by parsing the serialised value — Chromium serialises the wash in `oklab`, and a regex over that reads a lightness of 0.8 as 0.8 units of red. Asked of the chip row, because since #112 that is the only element it can be asked of. |
| **The prompt's own two colours** *(Open)* | Nothing measures them. `@wterm/just-bash`'s default prompt paints `user@wterm` in `--term-color-2` and the working directory in `--term-color-4`, neither of which the `.wterm` bridge overrides, so both arrive from the vendor's sheet (§03) — and neither will clear the row above against the yellow ground. This row exists so the gap is asked for rather than discovered; it wants the same canvas measurement, not a calculation. |
| **The character grid** | No gap is ever two blank lines; no row contains a tab; and every table on the page is a two-space indent, a column measured against its longest entry, and a three-space gutter — three tables, one shape. Asserted over the serialiser's output under `bun test` rather than in a browser, since it is a fact about strings. The two clauses about menu rows and the rail went with the widget (§02). |
| **No boxes** | No element on the page carries a border width, a border radius or a box shadow. Swept over `body *`, which since #112 covers the emulator's own markup too — the cheapest available check that the token bridge in `globals.css` did not import a renderer's default chrome along with its palette. |
| ~~**Nothing else animates**~~ | **Unenforced since #112.** *(Open — §08.)* It read: with motion switched on, no element runs an animation or carries a non-zero transition duration. The sweep lived in `e2e/boot.spec.ts` and went with the boot replay it was written for, and it cannot be restored where it was, because every Playwright project asks for reduced motion so a colour can be read at a stable phase. The one animation left is the emulator's cursor blink, so *reduced motion disables the blink* is asserted nowhere either (§03). |
| ~~**The boot behaves**~~ | **Retired by #112 with its subject.** It read: the boot completes inside its cap, arrives whole, and reaches the end the moment a key is pressed, and under reduced motion every observed state is the finished session. There is no boot — nothing on the page waits on a timer (§03). |
| ~~**The recording behaves**~~ | **Retired by #112 with its subject.** The same three against `demo`'s own cap, plus a lower bound, because React appended its rows in several mutations even inside one commit and *"some sample was partial"* would otherwise have proven nothing. There is no recording (§04). |
| Responsive | 375 / 768 / 1440 with no horizontal scroll — with `help` listed, with the wordmark wherever the grid is wide enough for it, and with the donation rows including the EVM note, which is the longest string the page prints. The wrapping is the emulator's own, which makes this a real question of the grid rather than an inherited one (§03). |
| **Theme flash** | None, on hard reload, in either theme, and **against a stored preference that disagrees with the system**. Measured as *how many rows had been parsed when the class landed* rather than by eye — a theme decided in a mount effect, or corrected after hydration, passes every weaker version of this check. |
| **Discovery document published** | `out/discovery.json` exists and satisfies `DiscoveryDocument` from `schema/`. Read from the export rather than `public/` — a correct source file that never gets copied is a CLI that cannot boot. |
| **Installers survive the export** | `out/install.sh` and `out/install.ps1` carry no carriage return, and `install.sh` opens with its shebang. A CRLF installer fails on its own first line for reasons that name no cause, and the export is built from the working tree rather than from git, so `.gitattributes` alone cannot guarantee what gets deployed. |
| **No WebAssembly in the export** | No `.wasm` file reaches `out/` at all. `@wterm/core` ships its module twice — as a file and as a base64 string inlined in its bundle — and picks between them on whether a `wasmUrl` was given, so the separate file is one prop away at any time and the difference is invisible on a page that works either way locally. It would not be invisible in production: a `.wasm` in the export is a second request on the critical path and a set of asset-serving headers this project has never had to think about. Matched on extension rather than on filename, because the name is the dependency's to choose. |
| **The published files are the files** | `sha256sum` run **inside the shell** over `install.sh`, `install.ps1` and `discovery.json` equals a digest taken over what the Worker actually served, and the seeded `README.md` equals the repo's. This is the other end of `lib/published.ts`'s one asymmetry — it reads `public/` because `out/` is mid-build — so a file that stopped reaching the export fails here even though the seed succeeded. It is also the check that makes §02's claim about verifying an installer true rather than rhetorical. |
| Static export | `out/` is complete and serves standalone with no Next.js runtime |

### Where each of these runs

| Where | What |
|---|---|
| `site.yml` | Everything: three typecheck programs, the session module's tests, then a build, then the four checks that read the export, then Playwright. The e2e step is last because it is slowest and needs `out/`, and it is the only step in this repo that installs a browser. Its path filter names `README.md` and `CONTEXT.md` as well as `site/**`, because since #113 one is seeded into the page and the other is what bounds the invention (§04, §07). |
| `deploy` | Re-runs `check:discovery`, `check:installers`, `check:fonts` and `check:wasm` before `wrangler deploy`, because the edit these files are most likely to receive is a kill switch flipped by hand, and that edit never opens a pull request. **Playwright is not in this path**, so a deploy runs no touch-target, focus or contrast check at all. |
| `cli.yml` | The two generated-content diffs — the wordmark and the help text (§04). |

**Two boundaries are worth not eroding, where there were three.** **Behaviour belongs to the session module's tests**, which run with no DOM and no browser; `tsconfig.test.json` compiles that module with no DOM lib at all, so reaching for `document` — or for `navigator.clipboard`, which hangs off it — fails to compile rather than failing review. The same module is also required to import no emulator and no shell, which is what keeps the renderer swappable (§07) and is **enforced by nothing** — the one boundary here worth watching hardest. **Only what needs pixels belongs to Playwright**, whose harness serves the export through `wrangler dev` rather than `next dev` — a font that never reached `out/` would render perfectly under the dev server, which is to say the harness would be unable to fail for the one reason it was built.

**The middle boundary is gone, and what it cost is not only a matter of degree.** Wiring belonged to a jsdom layer, deliberately thin: that a copy intent reached the clipboard API, that a keystroke arrived as an input, that focus landed where it was sent. #112 deleted it along with the text field and the hand-built renderer it was asking about, and it was this workspace's only test-only runtime dependency. The quality floor those cases held is now verified in a real browser or not at all, which makes the Playwright step load-bearing in a way it was not — and one class of case did not survive the move: **nothing in this repo asserts any role, any `aria-*` value or any accessible name.** The deleted layer held all of it, the live region and every control's accessible name included. §08 carries that.

Not every question moved down. The clipboard one moved *up*: it is asked of a real clipboard in a real browser now, which is a better answer than the one it replaced.

Wordmark integrity is still the row to actually measure rather than eyeball. The failure has changed — a per-glyph font fallback can no longer shear this page's art (§03) — but a lost row, a shifted row, a wrapped row and a wrong column count are all still invisible on the machine that built the page.

---

## 07 · Non-goals

- **No analytics, no third-party scripts, no third-party font, no network from the shell.** Nothing on this page needs a request to a party that is not Cloudflare. This is the rule that chose static wallet addresses over a hosted payment processor (§02), and it is the rule the webfont was vendored to keep — a font CDN would have been the second thing to break it. The emulator could have been the third twice over, and is not: its WebAssembly is base64-inlined rather than fetched, which `check:wasm` reads the export to keep true (§06), and `just-bash` ships a `curl` that can reach nothing, because network access must be configured and `live.tsx` configures none.
- **No SSR, no server components requiring a runtime, no route handlers.** *(Invariant.)* `lib/published.ts` reads four files off disk and is not an exception to this: it runs at prerender inside a static export, so there is no runtime, no route handler and nothing that needs a server. A future reader will ask, which is why it is written down here.
- **No downloadable binaries.** The install command only. The install script does architecture detection and checksum verification that a browser cannot, and the long workers.dev URL is never rendered at full length as body text.
- ~~**No simulating real commands.**~~ **Retired by #113, and the reason is worth keeping.** It read: nothing on the page invents a Resolution, a Tier, a Track list or a match rate, and the one labelled recording is the only place fabricated output appears. Three of those four clauses are now false. `lib/session/machine.ts` seeds two invented Playlists, eight invented Tracks with invented artists and albums, and a Tier the binary does not implement — and the recording the rule carved out for was deleted, so the sanctioned exemption went and an unlabelled one arrived. ADR-0011 argues why that is allowed; §04 states what bounds it.
- **No output attributed to a command the page did not generate.** The narrower rule that replaces the one above, and the half that was always mechanically true. The binary's help is generated from `cli/src/commands/` and diffed in CI; the invented Library and Mirror are files a visitor reads, not output a command produced; and the fence is `test/machine.test.ts` against `CONTEXT.md` rather than a label (§04).
- **No named colour schemes, and no accent token.** Light, dark and system only. The palette is two colours that swap places, and nothing this repo paints uses a third — the rail would have brought one and did not. **The emulator brings two**, so the rule holds over everything the page authors and no longer over everything it renders. *(Open — §03 has the mechanism and the fix; §08 tracks it.)*
- **No CMS.** The page's own strings do not need a content layer, and the generated ones already have a source.
- **No dependency on the API.** The page renders identically when `api.jukebox.dev` is down, because it never calls it.
- **No component library sprawl.** There is no `components.json` and no `cn()` helper, because there are no shadcn components — a config file and a class-merging utility kept for a hypothetical future are two files that do nothing today. `shadcn init` regenerates both in one command the first time a component is genuinely wanted. `site/components/` holds two files, and one of them is a row of buttons.
- **The sprawl that arrived instead was runtime, and it is recorded rather than forbidden.** Four runtime dependencies became nine: `@wterm/core`, `@wterm/dom`, `@wterm/just-bash` and `@wterm/react` at `0.5.0`, and `just-bash` at `2.14.5`, which declares fifteen of its own — `quickjs-emscripten`, `sql.js` and `re2js` among them. All five additions are **pinned exactly** where the four originals keep carets. What is bought is that line editing, history, recall and tab completion are somebody else's problem and a real bash answers a real pipe. What it costs is that **a pre-1.0 package renders the front door**, on a version range with no compatibility promise. Two things keep that a renderer swap rather than a rewrite: the pins, so an upstream break arrives on a deliberate bump rather than on an install; and the fact that only `components/live.tsx` and `globals.css` know the renderer exists, with `e2e/harness.ts` spelling its class names in one place so no spec has to. `lib/session/` imports no emulator and no shell, and §06 records that half of that boundary is enforced by nothing. *(For scale: `@wterm/*` is not the first pre-1.0 dependency here — `next-themes` at `^0.4.6` decides the theme before paint, caret-ranged, and is the looser exposure of the two.)*
- **No token without a consumer.** A palette entry or utility that nothing references is deleted, not left in place as a reservation. A `--line` was carried for a while as "reserved for rules" and removed once it became clear nothing drew any. The `--line` in §03 is a different token of the same name with two real consumers — `--row`, and the leading on `body` — which is the bar. **Three things currently sit below it** *(Open — §08)*: `--font-prose` and `.u-prose`, whose one consumer is overridden so the face paints nothing (§03); `spoken()` in `lib/session/lines.ts`, whose only callers are tests since the live region was deleted; and `guessed()` in `lib/session/install.ts`, the same (§01). This is the first real test of this rule since `--line`, and it is not being resolved here.

---

## 08 · Open questions

**What comes back, and when.** The page used to say nothing at all about how matching works, or that most tracks will not match. The Mirror now records a Track that matched nothing, so the first honest sentence about coverage is on the page and a visitor meets it before installing rather than after — and it is a stronger version than the recording's was, because `ls` counts one fewer file in the Playlist's folder than the record lists, and the record says why. That is a start rather than an answer. `DESIGN.md` L328 is clear that coverage should be presented as a property of the open catalogs rather than a bug, and the fuller version of that still belongs somewhere — a `/docs` page, or the install output itself. Deliberately deferred, not forgotten.

**What the floor does not catch.** Each is recorded in source today, and belongs here so that a reader of this document meets them too. #114 replaced three of these and added the rest.

- **The one-line handover is unmet, and unchecked** — #119. §01's first job. Nothing detects the visitor's system, the greeting carries no install offer, and the served page carries nothing at all — so a visitor who reads one screen and leaves has no command. Two honest ways out, and neither is chosen here: put an offer back in `greeting()` behind a user-agent read in `live.tsx`, which `guessed()` is already written and tested for; or accept that the page's first job is now *show what Jukebox is* and reorder §01 deliberately. Whichever, the check that went with the old form should come back with the new one.
- **Nothing announces what a command printed** — #123. The visually hidden `role="status"` region is deleted and nothing replaced it, so a command that did something says so to a sighted reader only. Measured: the page's only live region belongs to Next.js's router — an empty assertive alert in a shadow root, which announces route changes on a page with one route. `spoken()` and the `announcement` field survive with only test callers, so the material for a fix exists and nothing performs it.
- **The wordmark is absent from the accessibility tree rather than merely unlabelled** — #123. Measured: its painted cells are empty spans, so no block character reaches `textContent` and the five rows carrying art read as runs of spaces. It lost `role="img"` and its label with the element that carried them. Below 67 columns there is no art and the version line stands alone, which is the one width where nothing is lost.
- **The whole screen is one accessible value** — #123. The emulator's container is `role="textbox"` named *Terminal*, `aria-multiline`, with `aria-roledescription="terminal"` — measured at 6,955 characters at 1440, and it does change as commands run. Whether a browse-mode reader walks that as document text or reads it as a field's value is a question about the reader, and it is the question a real screen-reader pass would answer next.
- **Focus starts on a control that is hidden from the tree that would explain it** — #123. The emulator's input carries `tabindex="0"` and `aria-hidden="true"` at once, and appears in the tree — because it is focused — as a second textbox with no name. `Escape` moves focus to the first chip and is the only way out; without it the page is a WCAG 2.1.2 trap.
- **Nothing asserts any of the above** — #123. No test in this repo checks a role, an `aria-*` value or an accessible name (§06). That is what the jsdom seam took with it, and it is why every finding here is a measurement rather than a regression test.
- **`donate` shows a control that does not exist**, and separately cannot be copied from at all — #118, §06. Three ways out, none chosen: write the address to the clipboard from the command with an OSC 52 sequence, add a `copy <chain>` verb, or put a real-DOM row beside the chips. Stopping the inert word from being printed is smaller than all three and is the least the next ticket should do.
- **The prompt paints two colours nothing measures** — #120, §03 — and **Argon is shipped, subset, preloaded and never painted** — #121, §07. Both are two-line fixes with a decision in front of them.
- **The no-motion rule is unenforced**, and so is *reduced motion disables the cursor blink* — #122, §03. One extra Playwright project at `no-preference`, running one sweep, closes both.
- **The invented Tier is ahead of the binary** (§04). It can go when `jukebox show` prints a seventh column, and the glossary check will not tell anybody when that happens.
- **Source comments still cite the superseded record and two deleted specs** — #124. `globals.css` describes the page as a terminal "(ADR-0010)" and reproducing a rail whose colour it declines, names `e2e/prompt.spec.ts` and `e2e/menu.spec.ts` — both deleted — and asserts that nothing below it adds a third colour, which is false. `lines.ts` and `test/lines.test.ts` describe `screen.tsx` rendering the art as `role="img"` in the present tense. Flagged here rather than fixed, because #114 was a documentation pass and a comment sweep is its own diff — but `docs/agents/domain.md` asks for an ADR conflict to be named rather than left, so it is named.

**Long-tail coins.** The four static rows cover the common cases, but a donor holding something unlisted has no route. A hosted processor (NOWPayments, Coinbase Commerce) would take 300+ coins and auto-convert, at the cost of a fee, an account, and the §07 no-third-party rule. Worth revisiting only if people actually ask — not before.

**An ENS name for the EVM row.** `jukebox.eth` would be one readable string covering five chains, where the alternative is a 42-character hex blob. Cheap, and it makes the best line on the list also the most legible.

**The domain is not ours.** `jukebox.dev` is registered to somebody else, so the site deploys to `jukebox-site.<account>.workers.dev` and that is where `discovery.json` and both installers are served from today. This is a naming decision rather than a technical one.

It used to be the last thing blocking the install command from being true, and it is not any more: #38 published the command against the address that actually answers. What changed with it is the cost of settling the domain. This document used to say that nothing else changes when it does — that the Worker gains one `custom_domain` route and the discovery document gains one edited line. **That is no longer true**, because a published install command is a string that has to be written down wherever anyone might read it. The workers.dev address now appears in:

| Where | What |
|---|---|
| `site/lib/content.ts` | `SITE`, which both install commands are built from |
| `README.md` | both install commands, and the note explaining the address. Since #113 it is also read into the page at prerender and seeded at `$HOME/README.md`, which is why `site.yml`'s path filter names it (§06). |
| `docs/design/SITE.md` | §04's copy deck — this document. §02's sketch elides it, deliberately: it is the longest thing on the page. |
| `site/public/install.sh` | the usage comment at the top |
| `site/public/install.ps1` | the same |
| `.github/workflows/release.yml` | the release notes, and both `verify` jobs |
| `cli/src/discovery.ts` | `DISCOVERY_URL`, the one address compiled into the binary |

Only the last of those costs a client release; the rest are one commit. The alternative — holding the install command back until a domain exists — was the more expensive one, because it left the headline command in `README.md` untrue for everybody in the meantime.

**Three of those seven can no longer drift silently, which is new.** `scripts/check-installers.ts` reads `SITE` and fails when either installer's usage comment names a different address — a check that arrived because #113 shows those comments to visitors through `cat install.sh` — and `e2e/files.spec.ts` digests what the Worker serves against what the shell holds (§06). No eighth row was added by the page gaining a filesystem: `lib/published.ts` reads the published files rather than restating them, so what a visitor sees is `install.sh`'s own bytes.

`HOST` in `site/lib/content.ts` already names `jukebox.dev` and is deliberately *not* `SITE`. It is who the page speaks as rather than where its bytes come from (§02), so it does not change when the domain is settled and it must not be "fixed" to agree with the address above it. Since the page's own prompt stopped being drawn it reaches only the error sentences, which puts it one step further from a screen than it was — and therefore one step closer to being "corrected" by somebody who cannot see where it lands. `app/layout.tsx`'s `metadataBase` and `openapi.yaml`'s server entry also name `jukebox.dev`, and are the two places where doing so is harmless, because nothing resolves them.

**Docs route.** Whether `/docs` is MDX inside this app, a redirect to the GitHub README, or a separate surface.

**Status page.** `README.md` "Later" lists public coverage stats. It is the one page that would call the API, so it needs its own failure story.

**OG image and favicon.** The wordmark is the only mark the project has, and in `content.ts` it is text rather than an image — which is what keeps it generated and diffable (§03). An OG card would need it rendered to SVG or PNG at build time. That is a slightly smaller leap than it was: the page already paints the mark as gradients rather than typesetting it, so a rasterising step would not be the first thing to treat the art as geometry.
