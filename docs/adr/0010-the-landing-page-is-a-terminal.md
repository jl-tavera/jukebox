# The landing page is a terminal, not a one-screen hero

The landing page is a live terminal emulator, full-bleed, wrapping at the viewport. The tagline and
lede sit above the boot as `#` shell comments; the page then types `jukebox` and renders what the
real binary renders — the wordmark, a version line, and the interactive menu. A prompt sits below
it and the visitor can type, at the five entries the menu already carries and at verbs the page
adds: `help`, `install`, `donate`, `theme`, `demo`, `clear`.

`docs/design/SITE.md` argues for the opposite page in five places, and it argues well. This records
the trade, because #92 rewrites that document wholesale and a reader arriving afterwards would
otherwise find one document asserting the reverse of another with nothing in between.

Two rules hold the new shape together, and both are constraints rather than descriptions of a first
version. **The page explains; it never simulates** — real commands print their real help, generated
at build time from the CLI's own command definitions, and nothing invents a Resolution, a Tier or a
Track count outside one labelled recording. **The binary's vocabulary and the site's are never
dressed as each other** — commands the binary owns sit at a `$ jukebox …` prompt, verbs only the
page has sit at a `jukebox.dev ▸` prompt, and the menu carries the binary's own five entries and
nothing else.

## Why the old shape was right, and what changed

§02 closed with *"the page is a hero and stops"*, and §03 opened its typeface section with *"No
webfont. This is a decision with a reason, not a shortcut."* Both were correct for the page they
described. A hero handing over one command needs no route, no nav and no second screen, and a
wordmark built out of Block Elements is safest in a font stack every terminal already ships.

What changed is not taste. Three things about that page were defects rather than restraint.

Its two install rows run to 76 and 71 characters and carry a workers.dev address nobody can read
at a glance, which made the least legible object on the page also the largest. The `[donate]`
control is set in `--dim` at 12px at the bottom of the viewport, which is past quiet and into
unfindable, and its modal is the only boxed element on an otherwise unboxed page. And nothing on
the page shows what Jukebox does — a visitor learns the shape of the tool only after installing
it, which for a command-line tool is the whole of what they came for.

Jukebox is a CLI, and the most characteristic thing in its world is its own startup: a bare
`jukebox` prints a wordmark, a version line and a menu. A page that *is* that startup is both the
most honest hero available and the demo the page lacked. It also starts to answer §08's oldest open
question from the side that question asked for. The labelled recording shows a Track that matched
nothing, so the coverage story a visitor currently meets after installing is met before — not all
of it, and §08 keeps the rest, but the first honest sentence about it is now on the page.

## Considered options

**Keep the hero and add a recording below it.** The conservative shape, and the one that keeps both
guarantees untouched: the install command stays in static markup and the system monospace stack
stays. Rejected because the demo then sits below the thing it exists to justify, and because every
defect above is in the half that would not change — the URL is still the largest object, the
support ask is still invisible, and the typeface is still whichever one the visitor's OS picked. It
buys the missing demo at the price of leaving the page's actual problems in place.

**A static session, with typing as decoration rather than a live emulator.** This was the earlier
recommendation and it was reversed deliberately. A page printing a fixed script cannot answer
`help`, so every command's description becomes prose the site wrote about the tool instead of
output the tool produced — and prose about a command is a second copy of its help text, free to
drift from the binary at whatever rate the two get edited. That is the drift ADR-0007 refuses
inside the CLI, arriving from the other side. There the rule is that nothing is reachable in the
menu that flags cannot reach; here it is that nothing the page prints as a command's own output was
written by the page.

**Take the terminal and keep the system monospace stack.** The cheapest way to hold the no-webfont
guarantee, and it fails on the second rule above. The split between the binary's voice and the
site's is carried by Monaspace Neon against Argon rather than by the prompt glyph; with one face
for both, a `jukebox.dev ▸` line and a `$ jukebox` line differ at the left margin and nowhere else,
and the separation is gone the moment a reader stops looking for it. The page would also still look
deliberate on no machine, which leaves the third defect standing.

**Convert the wordmark to SVG and webfont everything else.** §03's own escape hatch — *"If a
webfont is ever introduced, the wordmark must be excluded from it"* — or converted to SVG first.
Rejected because the measurement made it unnecessary and because it costs a copy of the art. Both
Monaspace faces were read out of the v1.400 release: 2460 codepoints each, covering the whole Block
Elements range, the wordmark's glyphs, the spinner's quadrants and the prompt library's rail. #60
already keeps the art synchronised in two places from `DESIGN.md`'s fence, with a generator and
`git diff --exit-code`; an SVG would be a third copy that no diff could check, because it is not
text.

## Consequences

**The guaranteed one-line handover is gone, and a boot replaces a layout.** §01's brief was that a
visitor who reads one line leaves with the install command, and on a centred hero that was true by
construction: the command was in the markup, at a fixed place, with nothing to run first. Three
things replace it. The boot detects the visitor's OS and puts that command on screen with a copy
control and no typing (#91). The finished session ships in the served HTML, so a crawler, a screen
reader, a browser whose JavaScript failed and a visitor with reduced motion all still get it (#84).
And all three commands stay reachable when detection guesses wrong, so a wrong guess costs one
command rather than the visit.

What that does not restore is the guarantee. The command's presence is now a property of a build
step and a boot sequence rather than of a static document, and a property of that kind has to be
checked rather than assumed.

**The no-webfont guarantee is gone, and the wordmark's safety is measured rather than structural.**
§03's reasoning stands entirely: a default latin subset drops every glyph the art is built from,
the browser substitutes them per-glyph from a fallback with different metrics, and the art shears
apart silently, on someone else's machine rather than on the one that built it. Nothing about that
argument was wrong. What changed is that the coverage it could only assume can now be demonstrated.

Three things replace the guarantee, and they replace it unevenly. Subsetting whitelists the Block
Elements, Box Drawing and Geometric Shapes ranges explicitly. A check reads those ranges back out
of the built export rather than out of source, on the same reasoning the discovery check already
uses — a correct source file that never gets copied is a wordmark that shears (#81). And Playwright
measures all five rows at identical width at 375, 768 and 1440, because a glyph present in a cmap
is not proof of a correct advance width (#83).

The asymmetry is the cost, and it is accepted rather than argued away: the old rule could not fail,
and two of these three can. A subsetting change that drops a range is caught by a build step; a
build step that is removed, or that stops being run, is caught by nobody.

**§06's quality floor grows, and gains the kind of check that rots.** The old floor was mostly
assertions about static output — `out/` contains no font files, the `<pre>` does not wrap, four
strings match `README.md`. The new entries are about behaviour in a real browser: focus distinct
from hover, a 44px touch target on every cursor-landable word, `--dim` clearing 4.5:1 over the
hover wash, reduced motion rendering the finished session, no horizontal scroll and no theme flash.
That is why #83 is a harness in the site workspace rather than another test file — none of it is
answerable in jsdom.

**The three donation rules survive; the platform guarantees behind them do not.** §02 chose a
native `<dialog>` because focus trapping, Escape, returning focus to the trigger and making the
rest of the page inert all arrive free from the platform, *"and those are precisely the parts of a
modal most often got wrong by hand"*. The modal is gone, so those four are gone with it, and what
replaces them is a requirement rather than a gift: copy controls living in scrollback must stay
reachable by keyboard with a visible focus state. The rules about the values are untouched, because
they were never about the container — example addresses stay unsendable by construction, an
unconfigured row renders `not configured` with no copy control, and the clipboard always carries
the full untruncated address.

**The theme control loses its chrome, so the chip row becomes load-bearing.** §02 called the toggle
*"the single piece of chrome"* and gave the reason: a visitor with no control could only ever see
whichever theme their OS picked. `theme light`, `theme dark` and `theme system` keep all three
reachable and a bare `theme` reports the current one — but a command nobody can see is not a
control. The `theme` chip is what makes it discoverable, so the chip row is not decoration. If the
chips go, the theme control goes with them.

**Colour stays exactly where it was.** The prompt library paints its rail cyan and its radio green,
and the page does not follow it. Those are the library's colours; the CLI uses exactly one colour
in the whole program and prints a status as its stored word rather than as a colour, because colour
is gone under `NO_COLOR`, gone in a redirected stream and gone on a terminal that has none. The
rail's *shape* is what identifies it, so the shape is reproduced exactly and rendered in the
existing dim, ink and inverted tokens. No accent token is added and §03's palette is unchanged.

**What this does not weaken.** The page is still a static export with no runtime, still renders
identically when `api.jukebox.dev` is down because it never calls it, and still makes no request to
anyone but Cloudflare — the webfont is vendored and served from the site's own Worker, which is
what keeps §07's no-third-party rule intact through a redesign that could easily have broken it.
The separation of the site and API Workers, and the availability argument behind it, is untouched.

**What a reversal would cost, and what it would not.** Reverting means undoing a vendored and
subset font, a generated help-text step, a Playwright harness and the session module. That is
expensive, and it is the reason this is written down rather than left in a commit message. The copy
is the part that survives either way: the tagline and lede are still lifted verbatim from
`README.md`, which remains their source of truth, and the wordmark is still generated from
`DESIGN.md`'s fence. A reversal would lose the page and keep every string on it.
