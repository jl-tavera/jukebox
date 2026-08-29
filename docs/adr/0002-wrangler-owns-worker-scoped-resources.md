# Wrangler owns Worker-scoped resources

`CLAUDE.md` and `README.md` specify that Terraform owns what is created once — the D1 database, the
KV namespace, queues, R2 buckets, DNS records, WAF and rate-limit rules — while Wrangler owns what
changes constantly. We are deviating: **Wrangler owns every Worker-scoped resource, and the few
zone-scoped ones are set in the dashboard with their live config exported into `infra/`.**

The old boundary sorted tools by how often a resource changes. That line no longer separates
anything. Wrangler gained automatic resource provisioning in October 2025: declare a binding in
`wrangler.jsonc` with no id, and `wrangler deploy` creates the resource and writes its id back into
the config. It covers KV, R2, D1 and Queues — every resource this project provisions. Wrangler now
creates resources too, so creation frequency cannot be what divides the two tools.

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
already there: auto-provisioning writes resource ids back into `wrangler.jsonc`, which is committed
and drives deploys, so it is authoritative by construction rather than by discipline. A second
declarative record maintained alongside it earns little.

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

`wrangler.jsonc` is now the infrastructure record. It must be committed after any deploy that
provisions a resource, because that is when the ids are written into it. A deploy whose id write-back
is left uncommitted loses the record.

Security rules are no longer reverted to intent. Under Terraform, a rate limit loosened in the
dashboard during an incident would be undone by the next apply. That cuts both ways, and for a single
maintainer the failure mode of silently undoing an emergency fix is worse than the failure mode of
having to reconcile by hand afterwards.

Automatic provisioning is recent and gated behind a `--no-x-provision` flag whose prefix reads as
experimental. The ticket that depends on it verifies id write-back against staging before relying on
it, and records the explicit `wrangler d1 create` path as the fallback.

Terraform is not ruled out permanently. Revisit it when zone-scoped rules pass roughly ten, when a
second person applies infrastructure, or when reverting drift to a declared intent becomes a real
requirement rather than a theoretical nicety. Adopting it then costs `terraform import` for
zone-scoped resources only, since Worker resources stay with Wrangler either way.
