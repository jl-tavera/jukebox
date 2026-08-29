# Wrangler owns Worker-scoped resources

`CLAUDE.md` and `README.md` specify that Terraform owns what is created once — the D1 database, the
KV namespace, queues, R2 buckets, DNS records, WAF and rate-limit rules — while Wrangler owns what
changes constantly. We are deviating: **Wrangler owns every Worker-scoped resource, and the few
zone-scoped ones are set in the dashboard with their live config exported into `infra/`.**

The old boundary sorted tools by how often a resource changes. That line no longer separates
anything. Wrangler gained automatic resource provisioning in October 2025: declare a binding in
`wrangler.jsonc` with no id, and `wrangler deploy` creates the resource. It covers KV, R2, D1 and
Queues — every resource this project provisions. Wrangler now creates resources too, so creation
frequency cannot be what divides the two tools.

The replacement line is scope. A Worker-scoped resource is one a Worker binds to or routes through;
a zone-scoped resource is a rule applied to a domain. Wrangler can express the first and structurally
cannot express the second, and that boundary holds no matter what either tool adds next.

Two further Wrangler behaviours make the split practical. Bindings are **non-inheritable**: D1, KV
and Queue bindings must be declared per environment, so "staging and production cannot drift" is
enforced by the config format rather than by a tool watching for drift. And a route marked
`custom_domain: true` makes Cloudflare create the DNS record and issue the certificate on deploy, so
`jukebox.dev` and `api.jukebox.dev` need nothing else.

What remains outside Wrangler is WAF rules and rate limiting — on the order of three to six rules,
changed rarely. Standing up Terraform to own that surface would cost a hand-created R2 state bucket,
a second set of credentials exposed through `AWS_*` environment variables, and a Terraform toolchain
in CI. That is a large fixed cost against a small, slow-moving surface.

## Considered options

**Terraform with state in R2**, which the parent spec specifies. The bootstrap bucket, the second
credential, and the S3-compatible naming all exist to coordinate state between multiple operators.
This project has one operator, and nothing in the slice requires CI to apply infrastructure, so the
entire cost bought a guarantee nobody needed. It was also the single largest source of friction in
the first slice: one ticket existed mostly to service it.

**Terraform with local state.** Removes the bucket, the second credential and the `AWS_*` naming
while keeping a declarative record and `plan`. Rejected on the narrower ground that the record is
already there: `wrangler.jsonc` is committed and drives deploys, so a second declarative record
maintained alongside it earns little. This was argued at the time as authoritative *by construction*
rather than by discipline, resting on an id write-back that turned out not to happen for the
environments this project deploys — see the amendment below. The rejection stands on the cost of the
second record; that particular support for it does not.

**Dashboard changes plus hand-written JSON documentation.** Rejected because nothing reconciles the
document against reality. It describes what someone intended at the time of writing and goes stale
silently, which is worse than no record — it reads as authoritative while being wrong. Exporting the
live configuration from the API is the version of this idea that works, because a change nobody
wrote down still shows up as a diff.

## Consequences

There is no `plan`, no drift detection and no `destroy` for Worker resources. A deploy is the only
preview of a deploy. This is tolerable while the resource count is small and every change goes
through a reviewed `wrangler.jsonc`, and it is the first thing to become painful if that stops being
true.

`wrangler.jsonc` is now the infrastructure record. Any deploy that provisions a resource must be
followed by reading the new ids back and pasting them in by hand, then committing. A deploy whose ids
never reach the file loses the record — and for KV that is the whole of the record, since a namespace
carries no name in the config and its id is the only thing identifying which one it is.

Security rules are no longer reverted to intent. Under Terraform, a rate limit loosened in the
dashboard during an incident would be undone by the next apply. That cuts both ways, and for a single
maintainer the failure mode of silently undoing an emergency fix is worse than the failure mode of
having to reconcile by hand afterwards.

Automatic provisioning is recent and gated behind a `--no-x-provision` flag whose prefix reads as
experimental. #13 verified it against staging before anything relied on it; the amendment below
records what that found and what the fallback cost.

Terraform is not ruled out permanently. Revisit it when zone-scoped rules pass roughly ten, when a
second person applies infrastructure, or when reverting drift to a declared intent becomes a real
requirement rather than a theoretical nicety. Adopting it then costs `terraform import` for
zone-scoped resources only, since Worker resources stay with Wrangler either way.

## Amendment, 2026-08-29: the id write-back does not happen for a named environment

#13 deployed to staging on wrangler 4.127.1 and found the second half of the provisioning story
untrue. Creation works exactly as described: `wrangler deploy --env staging` created the D1 database,
the KV namespace and the queue from bindings declared without ids, and created the dead-letter queue
from being named in `dead_letter_queue` alone. But it wrote no id back — `wrangler.jsonc` was
byte-identical afterwards. The write-back appears to apply to the top-level config only, and every
deploy this project makes is to a named environment, so in practice it never applies.

The fallback this ADR asked for was needed, in its narrower half. Nothing had to be created by hand
with `wrangler d1 create`; the ids had to be read back with `wrangler d1 list` and
`wrangler kv namespace list` and pasted into the config.

What this costs is the "by construction" claim above. Keeping `wrangler.jsonc` truthful is now a
manual step after any provisioning deploy — which is discipline, the very thing
Terraform-with-local-state was rejected for needing. The decision still stands: resources are still
created from the config, and ids change only when a resource is created, which is rare. But this is
the assumption that broke first. Re-examine it if provisioning deploys become frequent, or if a
second operator starts making them.
