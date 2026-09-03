# Membership is made current by the write that records it, not by Refresh

Migration `0003` closed by saying that making membership current — soft-deleting a Track that left a
Playlist, re-placing one that moved — was Refresh's work and needed Refresh's acceptance criteria.
Issue #25's body said the same, and the comment left on it after #14 said it again. Three records,
one position: `recordTracks` writes add-only, and a rebuild of a KV snapshot from D1 waits until
something re-resolves Playlists on a schedule.

We are reversing that. `recordTracks` now reads the Playlist's current membership, diffs the
Resolution's Tracks against it, and writes the difference: a Track no longer offered gets a
`removed_at`, one that moved gets its `position` updated in place, one that did not move is left
alone, and one that is new is inserted as before.

## Why the deferral no longer holds

The reason given for deferring was always conditional, and `0003` stated the condition itself:
"nothing is wrong, because nothing reads these rows and nothing rebuilds a snapshot from them".

Issue #25 is what reads them. DESIGN §09's degradation for a cache that has lost a key is "fall back
to D1 + rebuild snapshot", and DESIGN §02's whole reason for keeping a canonical store is that the
KV snapshots can be rebuilt from it. Once the rebuild exists, an add-only membership is not a
harmless simplification — it is a reader being served a superset of the Playlist at stale positions,
under an ETag naming an immutable Version. That is worse than the bare `500` the rebuild replaces:
a `500` is loud, and a wrong body cached under a Version the client believes it holds is silent and
permanent.

The second half of the reason was that this needed Refresh's acceptance criteria. On inspection it
needs none of them. Refresh's open questions are *when* to re-read a Playlist, on what budget, and
what a client shows for a Track that has been Removed. None of those is asked by making a write
lossless. Everything this needed was already in the schema: `0002`'s `removed_at`, which was added
for precisely this and documented as "nothing sets it yet", and `0003`'s partial unique index
`playlist_tracks_present`, which is both the constraint that stops a Track being present twice and
the index this read wants — as `0003` itself said.

## Considered options

**Leave `recordTracks` add-only and ship the rebuild anyway, recording the staleness.** The smallest
diff, and the one #25 was written expecting. Rejected because the staleness is not visible to
anybody it hurts: it needs a redelivery, an upstream change between attempts, and a lost KV key, and
the symptom is a client holding a wrong track list for a Version it will never re-ask for. A rare
wrong answer that caches forever is worse than a rare loud failure.

**Leave `recordTracks` add-only and refuse the rebuild.** Ship `skipped`, the coded answer and the
Gone fallback, and leave #25's headline criterion open until Refresh lands. Honest, and it was the
fallback if this turned out to be large. Rejected because it leaves DESIGN §09's degradation
unimplemented for an unbounded time, on a dependency that is not real — Refresh does not gate the
correctness of a write.

**Make the rebuild tolerate stale membership.** Serve it without an ETag, or with `no-store`, so a
client cannot cache a wrong answer under a Version. Rejected as a worse shape than fixing the write:
it puts a second kind of Tracks response into the contract, and the client's `version` is read out
of the body regardless of the header.

## Consequences

`recordTracks` reads before it writes, so every Resolution that reaches it costs one more D1
statement. It costs fewer overall in the common case: a Track that did not move now costs nothing
where it used to cost two statements, and one that only moved costs one. That moves issue #26's
per-invocation query ceiling in the safe direction without raising it.

`removed_at` now has values in it, and nothing downstream reads them yet. That is the same shape
`0002` described when it added the column, one step further on: the rows are now true rather than
merely present.

Current membership is necessary for a trustworthy rebuild but not sufficient, and the gap is what
`0004`'s `membership_version` column closes. A Resolution writes membership *first*, so an attempt
that dies before storing its snapshot leaves the rows a Version ahead of everything that describes
them — and the Playlist row, still correctly describing the older Version, cannot see it. Stamping
the rows with the Version they were written for is how the rebuild tells the two apart. The same
column carries the one case current membership cannot express at all: a Source offering the same
recording twice, which `0003` decided a Playlist may not hold twice. There the stamp is written
`NULL`, and the rebuild refuses rather than serving a list one Track shorter than the Source's.

What is still Refresh's is unchanged and is not made easier or harder by this: scheduling
re-resolution on a fixed budget, and deciding what a client is told about a Track that has been
Removed. A Refresh landing later will find `recordTracks` already doing the right thing with what it
reads.

`0003`'s closing comment is now wrong about who does this. It is applied history and has not been
edited; migration `0004` records the reversal where a reader of the migrations will meet it.

## Amendment, 2026-09-02: the ceiling this moved is no longer the binding one

The Consequences above close by saying that reading before writing "moves issue #26's per-invocation
query ceiling in the safe direction without raising it". That was true of this change and is no
longer true of the code. Issue #26 has since been taken, and `recordTracks` no longer spends a query
per Track at all: each of its writes binds the Tracks it concerns as one JSON document, so a
Resolution costs the same handful of queries whatever the Playlist holds.

The sentence stands unedited because it was right about what this ADR decided. What replaced the
ceiling, and the ceiling that remains, are in ADR-0009.
