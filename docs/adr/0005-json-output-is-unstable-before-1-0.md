# JSON output ships now, and its shape is unstable before 1.0

Every command renders as exactly one JSON object, selected by `--json` or by stdout not being a
terminal. The shape of that object is explicitly unstable for the whole of 0.x: it can change in
any release, with no deprecation and no notice beyond the release notes. It freezes at 1.0.

`docs/design/DESIGN.md` §11 lists this as an open question and states the constraint sharply —
"agents will depend on the shape, so it needs a versioning story before it ships, not after."
This is that story, and it is deliberately the cheapest one that is honest rather than a
guarantee nobody can keep at version 0.1.0.

The saying-so is load-bearing, so it is said in three places that are hard to miss and hard to
let rot: the `--json` flag's own description in `--help`, a `jsonStability` field in the object
`--help --json` returns, and the README. All three read from one constant in `cli/src/version.ts`.

Shipping it now rather than at 1.0 is the other half of the decision, and it is not a
convenience. Every command computes one result object and then renders it, which is only true
because nothing was ever written the other way. A CLI whose commands printed as they went would
need each of them rewritten to gain machine output, and the rewrite would land on five commands
at once instead of on none.

## Considered options

**A shape version of its own, carried beside the binary's.** A second number in every envelope,
moved only when the shape moves. Rejected: two versions to keep straight before anything has
consumed either, and no consumer can act differently on them — one binary emits exactly one
shape, so the binary's version already names it exactly.

**Declaring the envelope in `schema/` beside the API contract.** Rejected because `schema/` is
the contract between the client and the server, and `CLAUDE.md` puts things shared between
surfaces there. The worker neither writes this shape nor reads it. If something ever generates
against it, that is when it moves and not before.

**Holding `--json` back until the shape can be promised.** Rejected on both halves. A shape being
unstable is a reason to say so, not to withhold it — the scripter who wants it today can read the
sentence and decide. And withholding it would mean the compute-then-render seam ships without
anything exercising it, which is the retrofit this avoids.

## Consequences

Anything built against the shape before 1.0 can break at any release. The `version` field in every
envelope is what a consumer pins or branches on, and it is the only warning there is.

The shape freezes at 1.0, which means what is in it at 1.0 is what has to be carried afterwards.
Fields added casually during 0.x are inherited rather than reconsidered, so the bar for adding one
rises as 1.0 approaches rather than falling.

The discovery document's `min_version` gate does not cover this. That gate stops a binary too old
for the API's contract; nothing stops a script too old for the CLI's output shape, and nothing
detects one. A scripter who does not read the version field gets a silent misparse, which is the
accepted cost of not building a second version negotiation for an interface that will be frozen
before it has many users.

## Amendment, 2026-08-30: the discovery document does go in `schema/`

#31 put `DiscoveryDocument` in `schema/`, which reads at a glance like the option this ADR
rejected. It is not, and the difference is worth stating so nobody undoes one by citing the other.

The rejection above turns on one sentence: *"the worker neither writes this shape nor reads it."*
That is a test about how many surfaces a shape crosses, not about which two. The CLI's output
envelope is written by the CLI and read by whoever runs it — one surface, so `schema/` would have
been a shared home for something nothing shares. The discovery document is written by the site and
read by the CLI. Two surfaces, deploying separately, able to drift. That is the same situation the
API contract is in, and `CLAUDE.md` sends it to the same place.

The second half of the rejection holds too, and is why the document is a hand-written type rather
than a path in `openapi.yaml`: nothing generates against it, because the API does not serve it.

Both shapes stay where they are. The envelope moves into `schema/` on the day something other than
the CLI generates against it — which is what this ADR already said.
