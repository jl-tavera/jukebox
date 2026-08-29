# Re-adding a Pending playlist asks for its Resolution again

`CLAUDE.md` states an invariant: "User requests never trigger an upstream playlist fetch. A cron job
refreshes tracked playlists on a fixed budget; the API only ever reads from cache." `docs/design/DESIGN.md`
§10 says the same thing more sharply — "No on-demand upstream fetch. Not even with a 'refresh now'
button. _(Invariant.)_" — and spec #5 spells out the consequence for this endpoint: `202` for an
already-pending Playlist, **without** enqueueing again.

We are deviating, in exactly one case. `POST /playlists` for a Playlist whose stored status is
`pending` enqueues a Resolution, every time.

## Why

`POST` records the Playlist and then asks for a Resolution. Those are two writes to two systems and
there is no transaction across them, so the second can fail after the first has succeeded. When it
does, the row exists and says Pending, and nothing is coming for it: no retry, because no message was
ever enqueued; no refresh, because nothing schedules one yet. Under spec #5's rule every later add
sees a tracked Playlist and asks for nothing, so the Playlist sits Pending for ever and the endpoint
answers "still working on it" for work nobody is doing.

It is the only state in the system with no way out of itself. Gone is terminal on purpose.
Unreachable has the queue's remaining attempts, and then the dead-letter queue, which exists so that
a Resolution nobody can complete "should sit somewhere it can be read rather than disappear". Pending
after a lost enqueue has none of that.

Nothing can distinguish that Playlist from one whose Resolution is genuinely in flight. Asking again
is what a system without that distinction can do about it.

## What bounds it

The invariant exists to keep upstream API usage proportional to distinct playlists rather than to
users. Three things keep this deviation inside that:

- **It applies only while a Playlist is Pending**, which is the seconds between an add and its
  Resolution completing. A resolved Playlist answers `200 ok` and asks for nothing; a Gone one is
  refused; an Unreachable one is answered without asking, because that case really would be the
  button §10 names — its Source has already been read, and the answer was a failure.
- **A second Resolution of unchanged contents writes nothing**: no snapshot, no membership rows, no
  Version. So the cost of a redundant ask is one read of the Source, not churn a client can see.
- **Adding is already the moment an upstream read is legitimate.** The first add causes one. This
  makes a re-add during the Pending window cost the same as the add that opened it.

## Considered options

**Leave it, and file the strand as its own issue.** Faithful to spec #5, and leaves a permanent
Pending state in the contract this ticket was meant to complete. The bug is invisible — the endpoint
answers `202` exactly as it would if everything were fine — so nothing would ever surface it.

**Compensate on failure: delete the row if the enqueue throws.** Never enqueues twice, and closes the
window it can see. But the compensating delete is itself a write that can fail, in a request that is
already failing, which leaves the same hole one level down.

**Let the refresh pick it up.** The right answer, and unavailable: nothing schedules a refresh yet.
Worth revisiting when it exists — a cron that re-resolves tracked playlists on a budget would sweep
up a stranded Pending Playlist without any request doing it, and this deviation could then be
withdrawn.

## Consequences

Someone rerunning `jukebox add` in a loop against a Pending Playlist can cause one upstream read per
run. The window is short and the reads are idempotent, but it is a request path that reaches a
Source, which nothing else in the API does.

`POST /playlists` now reads the stored status, which is a second D1 round trip on the re-add path.
The add that started tracking still pays nothing: it knows the Playlist is Pending because it just
made it so.

This deviation should be withdrawn when the scheduled refresh lands.
