# The menu is a launcher, and has no screens of its own

Running `jukebox` on a terminal opens a menu. Every entry in it runs a command that already exists
in the command tree, with its arguments collected by prompt instead of typed, and renders the same
result object that command already returns. Nothing is reachable in the menu that flags cannot
reach, and the menu adds no behaviour of its own.

That reads like a description of a first version. It is a constraint, it is meant to outlast the
first version, and this records why.

`main` is shaped as compute-then-render: every command returns one result object and prints nothing
on the way, and `render.ts` turns that object into either human text or exactly one JSON object.
ADR-0005 records what that shape buys and why it was bought before anything needed it — *"a CLI
whose commands printed as they went would need each of them rewritten to gain machine output, and
the rewrite would land on five commands at once instead of on none."* **Machine output is a property
of `main` rather than of each command, and that is only true because nothing was ever written the
other way.**

A menu with screens of its own would be the first thing written the other way. A screen that read
the Mirror to build a picker would be a second reader of local state, free to disagree with what
`jukebox list` prints. A screen that edited the configuration file would be a second writer of it.
Neither would have a `--json`, because neither would be a command — so the CLI would have two
behaviours, reachable by two routes, drifting apart at whatever rate the two got edited. Every entry
being a launch is what makes that impossible rather than merely discouraged.

The rule also has an assertion that can be written down and run, which is unusual for a decision
about shape: **driving a menu entry and running the equivalent command must produce the same
result.** A test making that comparison cannot pass while the menu quietly grows behaviour of its
own, so the constraint is enforced by the suite rather than by whoever reviews the next ticket.

The menu does write — a wordmark, a prompt, a spinner. All of it goes to stderr, and `render.ts`
keeps stdout alone, so the guarantee that stdout carries data and nothing else is untouched. That
file's own claim to be "the one place anything is written" is narrowed to results in the same commit
that makes it necessary.

## Considered options

**Screens of the menu's own.** The obvious shape for an interactive tool, and genuinely on the
table: a Playlist browser that reads the Mirror, a settings screen that writes the configuration
file, a Sync view that reports progress as it goes. Rejected because each one is a second
implementation of something a command already does, with no machine rendering, no exit code, and no
test that would notice when the two answers diverged. The first such screen costs nothing; the
fourth is a fork of the CLI that nobody decided to make.

**Keep the launcher rule for actions, but let pickers read state directly.** A narrower version, and
the tempting one, since a picker only reads. Rejected because reading is where the drift shows first
and is hardest to see: a picker built straight off the Mirror can disagree with `jukebox list` about
what is tracked, what its status is, or how many Tracks it holds, and the disagreement looks like a
bug in the command rather than in the menu. #56 builds its picker out of the result object `list`
returns, which also means status and Track counts arrive for free.

**Let the menu do what has no command yet, and add the command later.** Rejected because "later"
never has a forcing function, and the interim is exactly the state this ADR exists to prevent — a
capability a person can reach and an agent cannot. The order is the other way round: if something is
wanted in the menu, it becomes a command first, and the menu launches it. `config set` was added by
#53 for precisely this reason rather than the menu learning to edit a file.

## Consequences

**Anything wanted in the menu is a command first, including things that only make sense
interactively.** That is a real cost and it is accepted: it makes some features two tickets instead
of one, and it puts a flag form on the tree for things almost nobody will type. The compensation is
that an agent can do everything a person can, which is a property #50 lists as a user story rather
than an aspiration.

**The menu can never be richer than the CLI.** It is a way in, not a second product. Somebody
arriving expecting a file browser or an audio player finds neither, and the answer is a command
followed by a menu entry that launches it.

**Menu chrome is the first thing outside `render.ts` that writes anything.** The stream discipline
now rests on a split rather than on a monopoly: results on stdout through `render`, everything else
on stderr from wherever. That is weaker to state and no weaker in practice, because the property
callers depend on was always about stdout. It is asserted directly — a test drives the menu and
reads nothing at all on stdout.

**The menu stays in the terminal's normal buffer.** No alternate screen, which follows from the same
reasoning rather than being a separate taste: a full-screen application restores the terminal on the
way out and takes every result the session printed with it. A launcher whose whole purpose is to run
commands and show their output cannot be the thing that throws that output away. What is left in the
scrollback is the same text the flags would have produced, which is the launcher rule stated as a
property of the session rather than of one entry.

**Only the part of the prompt library that takes a stream is usable.** `select` and its neighbours
accept an `input` and an `output`, which is what routes every byte of chrome to stderr. Two things
in the same package do not: the `stream.*` helpers write to `process.stdout` directly, and the
spinner installs `SIGINT`, `SIGTERM`, `exit` and `uncaughtExceptionMonitor` handlers on the
process, which outlive the session that asked for them. #50 wants a spinner in #55, so that is the
constraint the ticket meets first: either it is driven through the same error sink as everything
else, or it is written rather than imported. A spinner on stdout would put chrome in the one place
this whole document exists to keep clean.

**A menu session exits zero whatever happened inside it.** Exit codes exist for callers, and the
entry condition — both streams terminals, no `--json` — guarantees no caller is there. The only
reader is a person's shell prompt, and reporting failure for something that failed earlier in a
session they then chose to carry on with and leave is noise. The one exception is a version gate
refusing the binary, which closes the menu because nothing in the session was usable.

## Amendment, 2026-09-01: the spinner is written rather than imported

The consequence above left #55 a choice with two ways out: drive the library's spinner through the
same error sink as everything else, or write one. It cannot be driven. Read at the version this
repository pins, `spinner` takes an `output` but no `input`, and its `start` calls `block()`, which
defaults its input to the real `process.stdin` — a keypress listener on a stream the `Io` that was
handed over says nothing about, in a program whose whole discipline is that streams are given rather
than reached for. That listener answers a cancel key with `process.exit(0)`, which is the single
thing `index.ts` sets an exit code rather than calling. The process-level handlers named above are
then the third reach outside the run, and measuring its own width from a stream that has none is the
fourth.

So `cli/src/spinner.ts` is forty lines of this repository's own. Two things about it follow from
this document rather than from taste:

- **It is handed where to write and whether to animate**, the way `header.ts` is handed a width and
  a colour. That is what keeps both of its branches reachable from a test, and what keeps the
  decision about which stream chrome goes on in the one file that already makes it.
- **It hides no cursor.** Showing one again after a Ctrl-C is the only thing it would need a handler
  on the process for, and a handler on the process is what this whole amendment is about. A blinking
  cursor beside a spinner is a smaller cost than a terminal left with an invisible one.

`Launch` grew a second argument in the same ticket, and it is worth saying why that is not the
widening this document warns about. A launch is compute **and** render, so chrome stopped when one
returns was still on the screen while the other wrote — a spinner ticking through `render` erases
the first line of the answer it was covering. The new argument names the moment between the two and
adds no other power: an entry still cannot ask for anything a typed vector could not, which is the
property the rule actually protects.
