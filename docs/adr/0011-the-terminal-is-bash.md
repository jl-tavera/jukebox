# The terminal is bash, and the page owns only what it says

The landing page is a terminal emulator running a real bash. `@wterm/dom` paints the grid,
`just-bash` resolves and runs every line, and `site/components/live.tsx` registers the page's
fourteen words into that shell and hands it a greeting composed as static text. The shell opens in
`/home/user`, which holds the site's own published bytes — both installers, `discovery.json` and
`README.md`, read off disk at prerender — alongside a Library of Playlist folders and a Mirror that
the page invents.

ADR-0010 records why the page stopped being a one-screen hero, and that decision stands: the page is
still a terminal, and it is now a real one. What does not stand is the pair of rules that record
named as constraints rather than descriptions, its arithmetic about what replaced the guarantee it
gave up, and its account of what holds the wordmark together. **This supersedes it rather than
amending it.** Amendment is this repo's usual instrument — ADR-0007 carries three dated ones — and it
works there because each narrows a single clause of a body that still argues correctly. Here the body
argues at length for two invariants that are now false, and footnotes under it would leave a document
contradicting itself, which is the confusion ADR-0010 was written to end.

Both rules survive in narrower form, and the narrowing is the point:

- **Nothing the page prints as a command's own output was written by the page.** Still true and still
  mechanically true: `cli/scripts/generate-help.ts` runs citty's `renderUsage` over `cli/src/root.ts`
  and splices the menu's question, its five entries and eight command descriptions into
  `site/lib/content.ts`, and `cli.yml` regenerates and diffs them. What is gone is the second half of
  *the page explains; it never simulates* — the filesystem holds invention that an ordinary `cat`
  reaches, with no label round it.
- **Each voice is still limited in what it may say.** Nothing typographic carries the split any more,
  and there is one prompt where there were two. What carries it is `site/lib/session/shell.ts`'s
  division between `greeting()`, which may speak as the page, and `started()`, which prints only what
  the binary prints — so the tagline and the lede belong to the greeting and to nothing a command can
  produce.

## Why one rule survived a real shell and the other did not

ADR-0010 stated its two rules side by side, in the same breath and at the same weight, and they were
not comparable. One was enforced by a generator and a `git diff --exit-code`. The other was enforced
by a font stack and a prompt string.

A library that draws its own prompt and paints its own cells retired the second in a single commit,
and no source file in this repo looked any different afterwards. `site/lib/session/commands.ts` still
composes `$ jukebox ` and `jukebox.dev ▸`; `site/test/commands.test.ts` still pins both strings;
`site/scripts/check-fonts.ts` still holds the subset to the `▸` one of them is drawn with. All of it
passes, and none of it reaches a screen — `answered()` drops the echo, because bash draws its own
prompt line, and `live.tsx` passes no `prompt` option, so what a visitor sees is
`@wterm/just-bash`'s default `user@wterm:~$`.

The generated half could not fail that way. A help text that stopped matching the binary is a failing
job in `cli.yml`. A prompt that stopped being drawn is nothing at all.

**A rule carried by a stylesheet or a string is one a dependency can retire silently. A rule carried
by a generator and a diff cannot be.** That is the transferable half of this record, and it is why
the surviving rule is stated above in the form a check could hold it to.

## Considered options

Adopting an emulator is not among these. #112 shipped it, and this record follows that decision
rather than reopening it. What follows are the forks inside the migration that were genuinely open,
and the one about this document.

**Amending ADR-0010 in place.** The house default, and rejected for the reason given above. The
distinction worth keeping is that ADR-0007's amendments each narrow one clause of an argument that is
still sound, whereas two of ADR-0010's load-bearing claims are now false in the middle of the
paragraphs that argue for them.

**Keeping the site's own renderer and putting bash behind it.** Coherent, and nearly available: #111
had already turned the verbs' rows into bytes through `written()`, an ANSI serialiser over
`Line`/`Span`/`Tone`, so a real shell writing into a hand-built screen was a shape somebody could
have built. Rejected in effect rather than on paper — a character grid, text measurement, wrapping, a
cursor and virtualised scrollback are most of what an emulator is, and the previous hand-built one is
exactly what #112 deleted.

**Passing a `prompt` option and keeping the two PS1s.** One argument to `BashShell`, and it was not
done. Worth admitting plainly, because it makes the typographic retirement below a description of the
tree rather than a decision anybody defended. The split was preserved in the one place it cost
nothing: `HOST` still opens the page's own error sentences, so `jukebox.dev: command not found: …` is
the page speaking, through `reworded()` rewriting bash's message on the way out.

**Labelling the invented filesystem the way the recording was labelled.** The sanctioned carve-out
was a transcript fenced by an opening and a closing label, and #112 deleted it. Reinstating that
device does not fit what replaced it: a label brackets a transcript, and a file in a filesystem has
no opening or closing beat to bracket. What was taken instead is a check rather than a marker —
`site/test/machine.test.ts` reads `CONTEXT.md` and holds every domain word in the Mirror's records to
the glossary in both directions, so a term used must be one the glossary grants and no synonym it
avoids may appear at all.

**Exempting the chip row from `.u-word`'s `font: inherit`, to keep the two faces distinguishable
somewhere.** One line, and declined. It would have bought back five buttons' worth of a split whose
whole subject — commands, output, the menu, the rail — is now cells in a grid the emulator draws in
one family.

**Giving the shell a `network` option.** `just-bash` ships `curl` and denies network access unless
one is configured. None is passed. Declined by omission, and recorded here so that `SITE.md` §07's
no-third-party rule does not read as something this migration got away with by luck.

## Consequences

**"The page explains; it never simulates" is retired, and a rule replaces a reviewer.**
`site/lib/session/machine.ts` seeds ten invented files into the shell: three Mirror records under
`~/jukebox/data/mirror`, and seven empty `.mp3` files across two Playlist folders in a Library under
`~/Music/Jukebox`. Two Playlists, eight Tracks, invented artists and albums throughout. `SITE.md`
§07 said *nothing on the page invents a Resolution, a Tier, a Track list or a match rate*, and three
of those four clauses are now false. Nothing labels any of it. What replaces the label is the
glossary check above, and the reason the exemption is allowed at all is one row of it: a Track at
tier `none`, in a record a visitor can find, is the page's only honest sentence about match coverage
— and `SITE.md` §08 has wanted that met before installing rather than after since it was written.

The retirement is scoped to the filesystem, and the scope is real rather than charitable.
`commands.ts` states that every row it prints is a description, generated help, or the page's own
copy, and the one carve-out that existed was deleted rather than widened.

**The invented Tier is ahead of the binary, and the check is structurally unable to notice.**
`CONTEXT.md` grants the word, so the glossary check passes. Nothing in `cli/`, `worker/` or `schema/`
implements one: `cli/src/commands/show.ts` prints `['#', 'TITLE', 'ARTIST', 'ALBUM', 'TIME', '']` —
six columns, the last unnamed — where the Mirror's records print seven under a `TIER` heading. So the
page prints a column no build of `jukebox show` prints, and the check cannot object, because the term
is in the glossary. The same check subtracts the invented names before testing, so it says nothing
about whether they are apt, only that no undeclared domain term slipped in. Both limits belong beside
the credit.

**`demo` is retired, and with it the last thing on the page that waited.** The page answers six
verbs, as it did before #112, and they are not the same six: `demo` went with the recording it
played, and #113 added `quit`. Nothing replaced it. `site/lib/session/demo.ts` and the typewriter
that paced it were deleted together, and the absence is measured rather than asserted — no
`setTimeout`, `setInterval` or `requestAnimationFrame` survives anywhere in `site/lib`,
`site/components` or `site/app`, so nothing on the page waits on a timer at all. Two of `SITE.md`
§06's cases went with their subject rather than being restored — *the boot behaves* and *the
recording behaves* — and a third went as collateral, which is the no-motion hole recorded below.
What a visitor gets in place of a paced transcript is a prompt that answers what they type, and the
fabricated output the recording used to fence is now the filesystem above.

**The typographic half of the vocabulary split is retired; the two faces are not.** Both are still
vendored from the Monaspace v1.400 release, still subset against an explicit whitelist, still
declared with `font-display: block`, still preloaded with `crossOrigin`, still shipped — and
`check:fonts` still holds both to the full required code-point list *and* asserts that the page asks
for both. Only Neon paints. `.u-prose` sets Argon on the chips and `.u-word` sets `font: inherit` in
the same `@layer components`, at equal specificity and later in source order, so the family is reset
before it lands; `site/e2e/wordmark.spec.ts` records the finding, because `document.fonts` reports
Argon `unloaded` on a fully painted page, and measures one face. The cost is stated rather than
argued away: CI enforces shipping and preloading a face that draws nothing, and the deeper reason it
draws nothing is that a terminal renders every cell in one family. There is nowhere for a second
voice to go.

**One prompt replaces two, and it paints two colours the palette does not have.**
`@wterm/just-bash`'s default renders `user@wterm` in SGR 1;32 and the working directory in SGR 1;34.
`globals.css`'s `.wterm` bridge re-declares `--term-bg`, `--term-fg`, `--term-cursor` and
`--term-color-8` in the page's own tokens and stops there, so `--term-color-2` and `--term-color-4`
arrive from the vendor's sheet as `#6a9955` and `#569cd6`. `SITE.md` §03 says there is no third
colour and no accent token, and `globals.css` says the same about itself — and the page now draws a
green and a blue on every prompt row, at ratios against the yellow ground that will not clear §06's
4.5:1 in the light theme. Two more lines in the bridge would settle it. It is recorded here as a cost
rather than fixed, and it should be measured the way §06 measures every other ratio — painted into a
canvas and read back — because §06 is explicit about why parsing a serialised colour lies.

**The static-HTML floor is gone, and ADR-0010's three replacements are not two but none, as written.**
That record gave up the guaranteed one-line handover and named three things replacing it. The served
session is gone: a terminal emulator needs WebAssembly and real text measurement, and a build machine
has neither, so the session is composed in the browser. The detected command with a copy control is
gone too, and more completely — `greeting()` carries no install offer, and `guessed()` in
`site/lib/session/install.ts` has no caller outside its own tests, so nothing on the page reads a user
agent at all. The third, that all three commands stay reachable when detection guesses wrong,
survives only with its premise removed: they are reachable through `install`, and there is no
detection to guess wrong.

The honest consequence is larger than the floor. `SITE.md` §01's first job — a visitor who reads one
screen and leaves has the install command, without having typed a word — **is not met at all.** It
now costs one typed word or one tap. Restoring it is a design decision and is left to somebody making
it deliberately.

Be precise about what *gone* means, because the file is there to open. `out/index.html`'s rendered
body is the `next-themes` inline script and a row of five chips: no terminal, no wordmark, no version
line, no install command as content. The command's *bytes* are in the document, inside the React
flight payload's inline `<script>`, along with the whole of both installers, `discovery.json` and
`README.md` — unrendered rather than absent, and invisible to anything that extracts text. The
tagline and lede still reach a crawler through `<title>` and the description meta tag. Nothing paints
until the JavaScript parses and a WebAssembly module instantiates: the nine chunks `index.html` names
are 1,963 KB unpacked and 569 KB gzipped, the largest of them 1,309 KB and 365 KB, and `check:wasm`
asserts that no `.wasm` reaches `out/` at all, so the module is inlined by design rather than
fetched.

What came back is different in kind, and worth more than it sounds. `published()` reads the real
installer and discovery bytes at prerender, so the shell hands a visitor the exact bytes the site
serves rather than a transcription of them — and `site/e2e/files.spec.ts` proves it by running
`sha256sum` *inside the shell* against a digest of what `wrangler dev` served. A visitor can verify an
installer before running it. That is something the hero could never have offered.

**The wordmark's integrity is conditional where it was measured.** `NATURAL` in `shell.ts` is derived
off the art — the longest row of `WORDMARK`, which is 67 — and `started()` prints the mark when the
emulator's column count clears it and a bare `jukebox <version>` line when it does not. Below the
threshold there is no smaller art: `cli/src/header.ts` falls back to the word `JUKEBOX` in a narrow
terminal, and the page falls back to a version string, so on a phone the only mark the page has is
`jukebox 0.1.0`. Measured: 375 gives 44 columns, 768 gives 84, 1440 gives 152. The number is derived
in one place and remembered in two — `cli/src/header.ts` and `cli/scripts/generate-wordmark.ts` both
write 67 as a literal — with a generator and a diff that fail if the art moves.

The branch is trustworthy now because of a bug it shipped with. `wt.cols` is the constructor's default
of 80 when `onReady` fires, because the emulator's own `ResizeObserver` delivers after `init()`
resolves — so a 375 viewport cleared 67, took the wide branch, and painted art truncated mid-row at
column 43. `live.tsx` observes the element itself, after the emulator's observer, and that is what
makes the count real.

**The wordmark's failure mode was removed rather than satisfied, which is the best news here.**
ADR-0010 traded the no-webfont guarantee for three things, the third being a browser measuring every
Block Element at the same advance as the spaces beside it. `@wterm/dom` intercepts U+2580–U+259F
before any text run is flushed and paints each cell as a CSS gradient in a `1ch` box, so the font is
never asked for a block glyph and a face that dropped the range cannot shear the art. The shear all
of that existed to prevent is unreachable. `e2e/wordmark.spec.ts` asserts a lattice of the columns
the blocks land on instead, with a deliberately red case that narrows the grid below the art after
the greeting was written — measured, 67 columns become 50. `check:fonts` still earns its keep, for a
consumer the page no longer is: `cli/src/header.ts` draws the same art in a real terminal.

**The three-boundary test rule is a two-boundary rule, and the browser step is load-bearing in a way
it was not.** `SITE.md` §06 put behaviour in the session module's DOM-less tests, wiring in a jsdom
layer, and only what needs pixels in Playwright. The jsdom layer is deleted: what it asserted was all
about a text field and a hand-built renderer the page no longer has, and it was the workspace's only
test-only runtime dependency. `typecheck` compiles three programs rather than four. The cost is the
one that commit named — the quality floor those cases held is verified in a real browser or not at
all — and it is not only a matter of degree. **Nothing in this repo now asserts any role, any
`aria-*` value, or any accessible name.** The deleted layer held all of it, including a block of cases
about the live region and the accessible name of every copy control.

A second hole opened the same way. The sweep enforcing §03's no-motion rule lived in the boot spec,
which went with the boot replay it was written for, so **nothing checks that rule now** — and the one
animation left on the page is the emulator's cursor blink, which `live.tsx` disables under
`prefers-reduced-motion`, while `playwright.config.ts` asks every project for reduced motion so that a
colour can be read at a stable phase. The only animation the page has is switched off in the only
configuration CI ever observes. Restoring the check means a second project, which is a change to the
harness rather than a line in a spec.

**The requirement that replaced the `<dialog>`'s four gifts is vacuous.** ADR-0010 gave up focus
trapping, `Escape`, focus return and inertness, and replaced them with a requirement rather than a
gift: copy controls living in scrollback must stay reachable by keyboard with a visible focus state.
There are no copy controls. `commands.ts` returns no intents for `donate` — correctly, because an
intent is performed on arrival and four would put four addresses on a clipboard for the act of
printing the block — and `written()` discards `Span.copies` by design. So each configured row prints
the literal word `copy` with nothing behind it, which is worse than an absence: the page shows a
control that does not exist. `e2e/donate.spec.ts` records the shape of it — a visitor who cannot use a
mouse can read the addresses and select one by hand, and has nothing to tab to.

The three rules about the *values* are untouched, because they were never about the container: example
addresses stay unsendable by construction, an unconfigured row renders `not configured` with no
control, and a copied address is never the truncated one. The second is now structurally true in the
strongest available sense, since nothing can be copied out of that block at all. `install`'s copy
still works, as an effect of running the verb, and `e2e/install.spec.ts` holds it against a real
clipboard.

**The menu is no longer a select, and ADR-0007 is untouched.** `site/lib/session/select.ts` is
deleted and `@clack/prompts` is not a site dependency. The five entries are a plain aligned table
printed once in the greeting, drawn from the same generated list through the same `table()` every
other table on the page uses, with the labels rendered as text rather than as landable words — what
replaces the gesture is that the label *is* the command, and every one of the five is registered in
the shell. The rail, the cursor, the radios and the legend row are gone, and with them §02's argument
about reproducing the rail's shape exactly and §06's touch-target exemption for menu rows.

The CLI's menu is untouched: five `select()` call sites survive in `cli/src/menu.ts` and
`@clack/prompts` is still a CLI dependency, so ADR-0007's launcher rule is unaffected by any of this.
Worth saying in as many words, because a reader who knows both records could reasonably fear
otherwise. The site's whole inheritance from ADR-0007 is the field that makes a printed entry a
typeable command.

**`help` no longer lists everything a visitor can type.** The page owns fourteen words — eight
generated command descriptions and the six verbs it answers for — and `help` lists those fourteen
under two headings. The shell answers many more names than that out of `just-bash`'s own bundle,
none of which the page introduces or documents. There is no replacement for the closed vocabulary,
and that is the trade: it is the same openness that lets a visitor run `sha256sum` on an installer
the page handed them.

**The accessibility floor narrowed to one row of buttons, and the wordmark left the accessibility tree
entirely.** Measured in Chromium's accessibility tree against the built export, at 375 and 1440:

- `@wterm/react` marks the grid `role="textbox"`, `aria-label="Terminal"`, `aria-multiline="true"`,
  `aria-roledescription="terminal"`, and the page adds `aria-keyshortcuts="Escape"` to the same
  element. The whole screen is exposed as **one node's value** — 6,955 characters at 1440 — which does
  change as commands run. A role-based view of the page is three nodes: that textbox, the chip group
  with its five buttons, and an empty alert.
- **The wordmark contributes blank columns.** Its 235 painted cells are empty spans, so there are no
  block characters in the tree at all; the five rows carrying art reach that value as runs of spaces.
  The `role="img"` and the label the art used to carry are gone, and nothing replaced them. At 375 the
  narrow branch means there is no art to miss and the version line stands alone.
- **Nothing announces what a command printed.** The visually hidden status region is deleted, and the
  only live region on the page belongs to Next.js's router — an empty assertive alert inside a shadow
  root, which announces route changes on a page that has one route. The site's own markup contains no
  live region, before or after running a command. `spoken()` survives in `lines.ts` with only test
  callers, which is a live breach of §07's rule against a token with no consumer.
- **Focus starts on a nameless control.** The emulator's input is a `<textarea>` carrying
  `tabindex="0"` and `aria-hidden="true"` at once. It holds focus on load and appears in the tree
  anyway, because it is focused, as a second textbox with no name.
- **`Escape` is the only way out, and it works.** `live.tsx` binds it in the capture phase, because
  the emulator focuses itself and consumes `Tab` for completion; after it, focus is on the first chip
  at both viewports. Without that binding the page is a keyboard trap under WCAG 2.1.2. The chip row
  is now the whole of the touch-target floor, the whole of the focus-state floor and the whole of the
  contrast floor — a regression rather than a design, because everything else those floors applied to
  was DOM the emulator replaced with characters.

The ticket that asked for this section predicted that a screen reader would meet the block characters
directly. It does not, and that correction is the reason the pass was run rather than reasoned about.

**The dependency surface goes from four to nine, and one of them renders the front door.** `next`,
`next-themes`, `react` and `react-dom` became those four plus `@wterm/core`, `@wterm/dom`,
`@wterm/just-bash` and `@wterm/react` at `0.5.0`, and `just-bash` at `2.14.5`. All five additions are
pinned exactly where the four originals keep carets, and `just-bash` declares fifteen dependencies of
its own — `quickjs-emscripten`, `sql.js` and `re2js` among them. `SITE.md` §07's non-goal about
sprawl is literally about component libraries and its literal subject is intact, but more than
doubling the runtime count is worth stating rather than assuming. One sharpening: the four `@wterm`
packages are pre-1.0, and `next-themes` at `^0.4.6` already was — caret-ranged, and deciding the theme
before paint. The older exposure is the looser one, and pinning is what makes the new one the tighter.

**What keeps that a renderer swap rather than a rewrite, measured.** Two files import the renderer:
`components/live.tsx`, and `globals.css` for the stylesheet and the token bridge. A third spells the
renderer's class names deliberately, in `e2e/harness.ts`, so that no spec has to. Everything deciding
what the page says is `site/lib/session/`, which imports no emulator and no shell — and
`tsconfig.test.json` compiles that directory with no DOM lib, so reaching for `document` fails to
compile rather than failing review. The abstraction those modules meet the world through is
`Line`/`Span`/`Tone` and `written()`, and `written()` predates the emulator, which is the evidence
that the seam was not drawn to fit this library. One honest qualification: the typecheck enforces the
no-DOM half and nothing enforces the no-shell half, so that boundary is a convention held by two
docblocks. It is the boundary in this workspace worth watching hardest.

**What this does not weaken.** The page is still a static export with no runtime, no route handler and
no server component that needs one — `published()` is a build-time read. It still makes no request to
anyone but Cloudflare: the WebAssembly is inlined and `check:wasm` reads the export to keep it that
way, both faces are vendored and served from this origin, and the `curl` inside the shell can reach
nothing because no network is configured. It still renders identically when `api.jukebox.dev` is down,
because it never calls it. `check:discovery` and `check:installers` still read `out/`, and `deploy`
still re-runs every export check before `wrangler deploy`. The separation of the site and API
Workers, and the availability argument behind it, is untouched.

**What a reversal would cost, and what it would not.** Two different reversals are now available and
they are priced very differently. Replacing the renderer is two files and a block of class names,
which is the whole reason the pins and the seam are recorded above. Undoing the shell is not a revert:
the reducer, the boot, the recording, the select, the composed session and the hand-built screen were
deleted, along with five browser specs and the jsdom layer, and a served floor would have to be
rebuilt behind a renderer that no longer exists. What survives either reversal is the part that always
did — the tagline and lede lifted verbatim from `README.md`, the wordmark generated from `DESIGN.md`'s
fence, the eight command descriptions generated from the binary, and the whole of `lib/session/`.
