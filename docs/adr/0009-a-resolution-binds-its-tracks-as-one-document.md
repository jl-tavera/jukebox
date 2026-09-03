# A Resolution binds its Tracks as one document, not one statement each

`recordTracks` wrote a Resolution's Tracks as one D1 statement per Track. D1 gives a Worker
invocation a thousand queries and applies its per-query limits to "each individual statement
contained within a batch statement", so the write cost one query per Track and a long Playlist
could not be recorded at all.

We are changing the shape of the write rather than its meaning. Each of the three statements now
takes the Tracks it concerns as a JSON document bound as a single parameter, which `json_each`
opens back into rows. A Resolution costs six D1 queries for a Playlist of five Tracks, eight for one
of five thousand and ten at Spotify's own ceiling of ten thousand -- and it is still one
`db.batch()`.

## What the arithmetic was

Counting one invocation, for a Playlist of `N` Tracks: `readTracked`, `presentIn`, two statements
for every new Track, one for every Track that moved, one for every Track that left, the
`membership_version` stamp, and `markResolved`. A first Resolution, where every Track is new, is
`2N + 4`, which passes a thousand at **N = 499**.

Spotify's own ceiling on a playlist is 10,000 entries and the adapter has walked all of them since
issue #12, so this was not a bound nobody would reach. It was twenty times short of what a Source
will hand over, and the failure it produced was a Resolution that threw, was redelivered, threw
again, and ended in the dead-letter queue -- with the Playlist stuck Pending and no reader told why.

Nothing local caught it. Miniflare enforces neither the count nor the ceiling, so the suite resolved
a 200-entry Playlist happily and would have resolved a 50,000-entry one just as happily.

## Why not the multi-row `INSERT` the issue proposed

Issue #26 proposed multi-row `INSERT`s, cut to D1's hundred bound parameters per query, and accepted
two costs for it. Both turned out to be avoidable, and the arithmetic behind the first had moved.

The ceiling it buys is too low. `tracks` has nine columns, so eleven rows to a statement;
`playlist_tracks` has four written, so twenty-five. Ten thousand Tracks is about 1,310 statements
against a budget of a thousand -- a ceiling near 7,600, under a Source that serves 10,000. A fix
that lands below the Source's own limit is one somebody meets.

The second cost was atomicity. `tracks.ts` claimed "one batch, so a Resolution that fails part way
leaves no half-written Playlist behind", and the issue read chunking as giving that up. It does not:
a batch is a transaction, and cutting a document into more statements inside the same batch changes
how many statements there are, not how many transactions. Nothing had to be surrendered.

And the issue counted two writes where there are four. It was written before ADR-0008, which made
`recordTracks` a diff: a Track that moved is re-placed, and one the Source no longer lists is marked
Removed. Both scale with the Playlist, and neither is an `INSERT`, so a multi-row `INSERT` does
nothing for either. The suite's own measurement of an emptied Playlist of five thousand Tracks was
5,003 queries, none of them insertions.

## Why joining and moving became one statement

The first attempt kept the four writes and gave the move an `UPDATE ... FROM json_each(?)`. It was
correct and unusably slow: 179 ms for five hundred moved Tracks, 675 ms for a thousand, 3,112 ms for
two thousand. `EXPLAIN QUERY PLAN` said why -- `SEARCH playlist_tracks USING INDEX
playlist_tracks_present` above `SCAN entry VIRTUAL TABLE`, which is the whole Playlist read once per
Track offered. Quadratic, against the thirty seconds D1 gives a query.

Joining and moving are one question -- where does this Track sit now -- so they are now one upsert.
Driven from the document, it seeks the row it means through `playlist_tracks_present` rather than
scanning for it: the same two thousand moves take 16 ms, and the plan is `SCAN json_each` alone.
That is a two-hundred-fold difference, and it is the reason the statement count is three rather than
four.

The upsert carries two conflict clauses, and the order is load-bearing. A conflict on the partial
index re-places the Track; anything else -- the primary key, which carries `added_at` and so can be
met by a row that has since been Removed -- falls through to a target-less `DO NOTHING` and is
forgiven exactly as the single clause forgave it before. The update names only `position`, so
`added_at` survives it. Migration 0002 keeps that column for the moment a Track joined, and a Track
being re-placed has not joined again.

## Considered options

**Multi-row `INSERT`s, as issue #26 proposed.** Plainer SQL, and no dependency on SQLite's JSON
functions. Rejected for the ceiling: about 7,600 Tracks, under a Source that serves 10,000, and no
help at all for the two `UPDATE`s.

**Chunk across several `db.batch()` calls.** The reading of the issue that would have cost the
atomicity it expected to pay. Rejected because it pays for nothing: the budget is per *invocation*,
not per batch, so more batches buy no more queries. It would have surrendered the guarantee and left
the ceiling where it was.

**Split a long Resolution across several queue deliveries.** Genuinely raises the ceiling, since
each delivery is its own invocation with its own budget. Rejected as far more than this needs: it
makes a Resolution's write non-atomic across messages, needs a resumption cursor in the message
body, and puts a partially-recorded Playlist into the states a rebuild has to reason about. Worth
returning to only if a Source ever offers a Playlist past a million Tracks.

**Leave it, and cap the Playlist length the adapter walks.** Honest and cheap, and it makes the
product worse in the way a user notices: a mirrored Playlist quietly shorter than the one they
pasted, which is the failure `skipped` exists to keep visible.

## Consequences

**The ceiling that remains is written down here.** A Track serializes to about 300 bytes -- 10,000
of them measure 2,968,891 -- so a piece holds some 2,000 Tracks, and a thousand queries are not
spent until somewhere past two million of them. That is two orders of magnitude beyond what any
Source offers. What a longer Playlist would meet first is not that at all: it is the total size of
one batch's bound parameters, which Cloudflare documents nowhere and no local test can measure. That
is what a run against real D1 is for, and it is why this ADR claims no number for it.

**A bound parameter is capped at 2 MB, which is why the document is cut at all.** Ten thousand
Spotify Tracks measure 2,968,891 bytes, which is past it. The cut is by size rather than by a count
of rows, since a Playlist of long titles is not a Playlist of short ones, and it is measured in
UTF-16 code units because the bound is then provable without measuring bytes: UTF-8 spends at most
three bytes on a code unit, so `PIECE` of 600,000 is 1.8 MB whatever alphabet the titles are
written in.

**The pieces are pieces of a document, never of a batch.** The atomicity `tracks.ts` claimed is
unchanged, and the claim now says so rather than naming #26 as an open question.

**`worker/test/bindings.ts` gained `holdingD1sLimits`.** The runtime enforces neither limit, so a
stand-in does: it charges a query where one is run and one per statement inside a `batch`, refuses
past the budget, and refuses a bound string past 2 MB. Both halves earn their place -- without the
first, this class of defect is invisible locally and appears first in production, which is exactly
how #26 was found; without the second, `PIECE` could be raised to anything and every test would go
on passing, since the cutter has no other witness.

**The first acceptance criterion is half-open until someone runs it.** "A Playlist of several
thousand entries resolves against a real D1" is satisfied locally, at Spotify's own ceiling of
10,000, against a stand-in that models the two limits. It is not yet satisfied against real D1,
which needs staging credentials. Until that run happens this ADR's claims about a real database are
reasoned from Cloudflare's published limits rather than observed.

**This depends on SQLite's JSON functions and on chained upsert clauses**, which is a dependency the
old statements did not have. D1 supports `json_each`, `->>` and multiple `ON CONFLICT` clauses;
`wrangler.jsonc`'s compatibility date puts it well past the versions that introduced them. A Source
adapter is unaffected -- this is entirely below `recordTracks`.

**ADR-0008's closing sentence about issue #26 is now stale.** It said the diff "moves issue #26's
per-invocation query ceiling in the safe direction without raising it", which was true when written
and describes a ceiling that no longer binds. It is recorded there as an amendment pointing here,
rather than edited.
