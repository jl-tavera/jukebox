# The release workflow is triggered by a tag, and carries no path filter

`.github/workflows/release.yml` runs on `push: tags: ['v*']` and filters no paths. Every other
workflow in this repo carries one, and `CLAUDE.md` states the rule plainly — *"Each has its own CI
workflow with a path filter, so touching the landing page never redeploys the API. When adding a
workflow, keep the path filter."* This records why the fourth one does not, so that nobody adds a
filter back on the strength of that sentence and quietly switches releases off.

**A path filter on a tag push does not scope the workflow. It suppresses it.** GitHub applies
`paths:` to a tag push the same way it applies it to a branch push, by looking at what a commit
changed. A tag does not change anything — it names a commit that has usually already been pushed
and already had its diff evaluated. So the filter matches nothing and the release never runs. The
failure is silent and arrives at the worst moment: the tag is pushed, no workflow appears, and the
version has already been announced to `cli/package.json`.

**What the rule protects is still protected, by the trigger rather than the filter.** The reason
for path filters here is cost and blast radius: shipping the landing page must not redeploy the
API. `release.yml` builds `cli/` artifacts and publishes a GitHub Release. It deploys neither the
site nor the API, and it cannot run at all except on a tag. A push to `main` touching `site/**`
does not start it, which is the property the rule exists to buy.

`cli.yml` is untouched and remains the CLI's path-filtered workflow. Typecheck and tests still run
there on every push and pull request that touches `cli/**` or `schema/**`. The release workflow
runs them again on the tagged commit, because a tag can name any commit and the one being shipped
is the one worth proving.

## Considered options

**Fold the release into `cli.yml` as a second job.** The obvious reading of the rule, and the
reason this ADR exists. `on.push` is a single mapping, so `branches`, `tags` and `paths` share one
block: adding `tags: ['v*']` beside the existing `paths:` list produces exactly the suppression
described above. Splitting the difference — keeping the filter and gating the job with an `if:` —
does not help, because the filter decides whether the *workflow* runs before any job's condition is
read.

**Trigger the release on `workflow_dispatch` only, and pick the version from an input.** No tag, so
no filter question. Rejected because it moves the version from a git object to a text box. The tag
is what `gh release create --verify-tag` checks against, what the guard compares to
`cli/package.json`, and what a person reads to find out what they installed. An input is none of
those and can be typed wrong.

**Release from a branch, and tag afterwards.** Rejected for the same reason in a different order:
the artifact would be built before the thing that names it exists, and a failed publish would leave
a tag pointing at a release that is not there.

## Consequences

**This workflow runs on every `v*` tag regardless of what changed.** That is the intended
behaviour and it is also the whole of the looseness being accepted. A tag pushed by accident starts
a release; the guard comparing the tag to `cli/package.json` is what stops it turning into a
published one, and that guard is now load-bearing in a way it would not be under a filter.

**The version bump and the tag are two steps, and nothing enforces their order.** Raising
`cli/package.json` without tagging does nothing. Tagging without raising it fails the guard. Both
are recoverable; neither is detected in advance.

**`workflow_dispatch` re-runs `verify` alone.** The release job is gated on
`github.event_name == 'push'` as well as the ref, because a dispatch can be launched *from a tag* —
which would otherwise satisfy a ref-only test, re-enter the release job, and fail on a release that
already exists. The dispatch path exists so that a `verify` failure caused by the site not yet
serving the installers can be retried without cutting a second tag.

**A fourth workflow now reads differently from the other three.** Anyone comparing them finds one
without a filter, which is the confusion this document exists to end. If a fifth workflow is ever
added on a tag trigger, it inherits this reasoning rather than re-deriving it.
