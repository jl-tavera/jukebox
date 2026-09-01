import type { Readable } from 'node:stream'
import { Writable } from 'node:stream'
import { confirm, isCancel, select } from '@clack/prompts'
import pc from 'picocolors'
import type { Listed } from './commands/list'
import { header } from './header'
import type { Io } from './io'
import type { Renderable } from './outcome'
import { held, identified, named } from './phrasing'
import type { MirroredPlaylist } from './reading'
import { VERSION } from './version'

/**
 * The menu: what `jukebox` does when a person runs it with nothing to run.
 *
 * **A launcher, not a surface.** An entry here runs a command that already
 * exists, with its arguments collected by prompt instead of typed, and renders
 * the result object that command already returns. Nothing is to be reachable
 * here that flags cannot reach, and the menu adds no behaviour of its own --
 * which is what keeps `main`'s compute-then-render shape, and so keeps machine
 * output a property of `main` rather than of each command. That is
 * docs/adr/0007, and it is the constraint every later ticket in #50 inherits.
 *
 * **What is wired.** #54 built the path from a bare invocation to a menu and
 * back out to a shell, with `quit` as the only entry that did anything. #56
 * wired `list`, and with it the two commands reached through nothing else: pick
 * a Playlist, land on its `show`, and stop tracking it from there, so that the
 * id nobody memorises is never asked for. `add`, `sync` and `config` still name
 * the command to type instead of running it; #55 and #57 replace one of those
 * lines each. `USAGE` below is where that is written down.
 *
 * **Everything written here is chrome, and chrome goes to stderr.** `render.ts`
 * keeps stdout, and keeps it alone, so "stdout is the guarantee" survives a
 * second writer existing at all. A test asserts it the only way worth asserting
 * it: drive the menu, and find nothing on stdout but what the same commands run
 * from a shell would have written there.
 *
 * **The normal buffer, deliberately.** No alternate screen. A full-screen app
 * restores the terminal on the way out and takes every result the session
 * printed with it, which would make the menu strictly worse than the commands
 * it launches. What is left in the scrollback is the same text the flags would
 * have produced.
 *
 * **One meaning for a cancel, everywhere.** Ctrl-C leaves the session from any
 * screen, exactly as `quit` does, and every screen below the top carries a
 * `back` of its own. #50 asks that a person never wonder whether a keystroke
 * has quit or gone back, and a cancel meaning one thing at the top level and
 * another inside a picker would be that question asked twice.
 */

/** The top level. One entry per command #50 puts here, and the way out. */
type Entry = 'add' | 'sync' | 'list' | 'config' | 'quit'

/**
 * The entries, in the order #50 sets: the two that reach the network, the two
 * that read only local state, then the way out.
 *
 * Exported so that a test pins these rather than a paraphrase of them, the way
 * `remove.ts` exports the sentence it has to say. The hints are what a test can
 * actually discriminate on -- three of the five labels are substrings of some
 * other word on screen, and `list` is a substring of `playlist`.
 *
 * `show` and `remove` are deliberately absent, and are none the less reachable:
 * both are entered through `list`, which is the one screen where the Playlist
 * they take is already in front of the reader. An entry for either would have
 * to ask for an id first, which is the thing #50 exists to stop asking for.
 */
export const ENTRIES: { value: Entry; label: string; hint: string }[] = [
  { value: 'add', label: 'add', hint: 'Track a playlist' },
  { value: 'sync', label: 'sync', hint: 'Ask every playlist what changed' },
  { value: 'list', label: 'list', hint: 'Every playlist you track' },
  { value: 'config', label: 'config', hint: 'Settings, and where each value came from' },
  { value: 'quit', label: 'quit', hint: 'Leave the menu' },
]

/**
 * What to type instead, for an entry no slice has wired up yet.
 *
 * They are listed rather than hidden, and rather than shown greyed out -- the
 * prompt library offers a `disabled` flag that would do it. An entry nobody can
 * land on exercises none of the select-and-come-back path, which #54 was built
 * to prove and everything below still rests on.
 *
 * Two are left, and each is one line: #55 takes `add` and `sync`, #57 takes
 * `config`. `list` was the third and is gone from here, which is what a wired
 * entry looks like.
 */
const USAGE: Record<Exclude<Entry, 'quit' | 'list'>, string> = {
  add: 'jukebox add <url>',
  sync: 'jukebox sync',
  config: 'jukebox config',
}

/**
 * What the two screens below the top ask, exported so that a test pins the
 * question rather than a paraphrase of it -- as `ENTRIES` is here, and as
 * `remove.ts` does with the sentence it has to say.
 *
 * Both are needed for an assertion that can only be made about the exact words,
 * and both of those assertions are negative: a Mirror with nothing in it must
 * not open a picker at all, and a Playlist that would not show must not be
 * offered up to act on.
 */
export const WHICH_PLAYLIST = 'Which playlist?'
export const FOR_THIS_PLAYLIST = 'What next for this playlist?'

/**
 * What is asked before anything is deleted.
 *
 * `named` rather than the `identified` every other line uses, and the reason is
 * that file's own: the id is there because it "is the string the next command
 * takes", and on this screen there is no next command for anybody to type it
 * into. The Playlist was picked from a list a moment ago and its `show` is
 * still above the question.
 */
export const askingToStop = (playlist: MirroredPlaylist): string =>
  `Stop tracking ${named(playlist.title, playlist.id)}?`

/**
 * One command, run the way a shell runs it and rendered where a shell would see
 * it, handing back the result object it computed.
 *
 * The launcher rule, written as a type. An entry does nothing itself: it hands
 * over an argument vector, `main` computes and renders exactly what it would
 * for the same vector typed at a prompt, and what comes back is the object
 * `--json` would have carried. A menu wanting to do something no vector can
 * express would have to widen this signature first, which is the whole point of
 * it being this narrow.
 */
export type Launch = (argv: string[]) => Promise<Renderable>

/** What every prompt in a session is handed: the keyboard, and where to draw. */
type Asking = { input: Readable; output: Writable }

/** Where a screen sends the person next. */
type Next = 'menu' | 'quit'

/**
 * The error sink, as something the prompt library can write to.
 *
 * Its prompts each take an `input`, an `output` and a signal, and `Io.err` is a
 * function rather than a stream. Strings are left as strings rather than
 * decoded from a buffer, so a multi-byte character cannot be split across two
 * writes and arrive as two broken ones.
 */
const writingTo = (io: Io): Writable =>
  new Writable({
    decodeStrings: false,
    write(chunk: unknown, _encoding, done) {
      io.err(typeof chunk === 'string' ? chunk : String(chunk))
      done()
    },
  })

/**
 * Runs until the person quits, and answers with the session's exit code.
 *
 * **Always zero.** Exit codes exist for callers, and no caller can reach this:
 * the entry condition in `main` is that both streams are terminals, so the only
 * reader is a shell prompt. Reporting failure for something that failed earlier
 * in a session the person then chose to carry on with and leave is noise -- and
 * a command that fails inside a session renders its own message and comes
 * straight back here. #55 adds the one exception #50 names -- a version gate
 * refusing this binary, which closes the menu because nothing in the session
 * was usable.
 *
 * Ctrl-C leaves the same way `quit` does. It is how a person says they are
 * finished with a menu, and answering it with a failure would make the ordinary
 * way out look like a fault.
 */
export const menu = async (io: Io, launch: Launch): Promise<number> => {
  const asking: Asking = { input: io.in, output: writingTo(io) }

  // Two halves, and each covers what the other cannot.
  //
  // The library is where `NO_COLOR`, `--no-color` and a dumb terminal are
  // honoured, and it is the check #54 asks for by name. What it cannot answer
  // is this run's own streams: it reads the real process, and on Windows it
  // says yes unconditionally, pipe or no pipe.
  //
  // The stream it is asked about is the error one, because that is where every
  // byte below goes. Asking about stdout would be asking about a stream this
  // function never writes to -- and, worse, one the entry condition has already
  // guaranteed is a terminal, so the guard could never fire. `2>log.txt` at a
  // terminal is the case that makes the difference visible.
  const colour = pc.isColorSupported && io.stderrIsTty

  try {
    io.err(header(io.columns, VERSION, colour) + '\n\n')

    for (;;) {
      const chosen = await select<Entry>({
        message: 'What next?',
        options: ENTRIES,
        ...asking,
      })

      if (isCancel(chosen) || chosen === 'quit') return 0

      if (chosen === 'list') {
        if ((await browse(launch, asking)) === 'quit') return 0
        continue
      }

      io.err(`\`${chosen}\` is not in the menu yet. Run \`${USAGE[chosen]}\` for now.\n\n`)
    }
  } finally {
    // Handed back before the process is left to end on its own. `index.ts` sets
    // an exit code rather than calling `process.exit`, so a stdin still flowing
    // is an event loop still alive -- a binary that drew a menu, took the quit,
    // and then sat there.
    io.in.pause()
  }
}

/**
 * The way back, spelled once and used by both screens that offer one.
 *
 * A named value rather than a literal because the picker's other entries are
 * Playlists themselves, so this has to be something none of them can be
 * mistaken for; the Playlist screen then takes the same value for the same
 * word, rather than the two screens saying `back` by two different mechanisms.
 */
const BACK = 'back'

/**
 * `list`, and then the answer it gave offered back as a picker.
 *
 * The Playlists come out of the result object the command just returned, not
 * out of a second read of the Mirror. ADR-0007 considered the narrower rule
 * that would have allowed the other thing -- keep the launcher rule for
 * actions, but let pickers read state directly -- and rejected it, because
 * reading is where drift shows first and is hardest to see: a picker built
 * straight off the Mirror can disagree with `jukebox list` about what is
 * tracked, and the disagreement reads as a bug in the command.
 */
const browse = async (launch: Launch, asking: Asking): Promise<Next> => {
  const playlists = tracked(await launch(['list']))

  // Said already, by `list`, in the sentence that points at `add`. An empty
  // picker would be a screen offering a person nothing to do, and a sentence of
  // the menu's own here would be the menu saying something no command says.
  if (playlists.length === 0) return 'menu'

  for (;;) {
    const picked = await select<MirroredPlaylist | typeof BACK>({
      message: WHICH_PLAYLIST,
      options: [...playlists.map(offer), { value: BACK, label: 'back', hint: 'Back to the menu' }],
      ...asking,
    })

    if (isCancel(picked)) return 'quit'
    if (picked === BACK) return 'menu'

    const next = await inspect(picked, launch, asking)
    if (next !== 'picker') return next
  }
}

/**
 * The Playlists a `list` reported, and none at all for one that failed.
 *
 * The cast is the same trust `main` places in citty's `any` return, made in the
 * other direction: a launch runs whatever vector it is handed, so what it
 * answers with is typed `unknown`, and this is the one place that knows the
 * vector was `list`.
 *
 * A `list` that failed has already rendered its own message -- a Mirror that
 * will not open is the whole of what can go wrong in it -- so there is nothing
 * to offer and nothing further to say about it.
 */
const tracked = ({ outcome }: Renderable): MirroredPlaylist[] =>
  outcome.ok ? (outcome.data as Listed).playlists : []

/**
 * One Playlist, as the picker offers it: what `list` calls it, what `list` says
 * its status is, and what `list` says it holds.
 *
 * Three of that command's four columns, in that command's own words, read
 * straight out of the result object it returned. That is what #50 means by the
 * counts coming for free, and it is why nothing here can disagree with the
 * table printed a line above.
 *
 * All of it on the label, and none of it in a hint. The library draws a hint
 * only for the entry a person is standing on, so a hint is invisible for every
 * Playlist but one -- and what a person came to this screen to do is compare
 * them. A Gone Playlist has to be tellable from an Ok one by looking, not by
 * arrowing onto it.
 *
 * Every status said, including the ordinary one. `show` passes `ok` over in
 * silence, and this follows `list` instead, because this screen is `list`'s own
 * report offered back: a row that said nothing where its neighbour said
 * `pending` would leave a reader working out which absence meant what.
 *
 * The word rather than a colour, which is `list`'s rule and holds here for a
 * further reason: colour is gone under `NO_COLOR`, gone in a redirected stream
 * and gone on a terminal that has none, and those three statuses have to read
 * differently in all of them.
 *
 * The one column left behind is when the Mirror's copy last moved, which is the
 * table's to say. It answers nothing about which Playlist to pick.
 */
const offer = (playlist: MirroredPlaylist) => ({
  value: playlist,
  label: `${identified(playlist.title, playlist.id)}, ${playlist.status}, ${held(playlist)}`,
})

/**
 * One Playlist: its `show`, and the offer to stop tracking it.
 *
 * This is the screen the whole ticket is for. `remove` takes an id that only
 * `list` prints, so running it from a shell means copying a string out of one
 * command's output and into another's arguments -- and mistyping it is how
 * somebody stops tracking the wrong Playlist. Here it is the Playlist already
 * on the screen, and there is no id to get wrong.
 *
 * Confirmed first, which is the one thing this screen does that the command
 * does not. `remove.ts` says why it has no prompt of its own: what it deletes
 * can be asked for again, and a prompt would have been a second thing writing
 * to the terminal. Neither argument reaches here -- a menu is already prompting
 * on a stream that is already not stdout, and a person who arrived by pressing
 * return twice would otherwise be one press from deleting something they were
 * only reading about.
 *
 * The confirmation asks and says nothing else. What stopping costs is on the
 * screen above it, in the `show` the person is looking at; what it leaves
 * untouched is in the note `remove` prints afterwards. A third version written
 * here would be the copy that drifts.
 */
const inspect = async (
  playlist: MirroredPlaylist,
  launch: Launch,
  asking: Asking,
): Promise<Next | 'picker'> => {
  const shown = await launch(['show', playlist.id])

  // It has said why -- the Mirror would not open, or another terminal stopped
  // tracking this one between the `list` above and the return that picked it.
  // Either way there is nothing on the screen to act on, and offering to stop
  // tracking a Playlist that would not show is offering to do the thing that
  // has just failed.
  if (!shown.outcome.ok) return 'picker'

  const action = await select<typeof BACK | 'remove'>({
    message: FOR_THIS_PLAYLIST,
    options: [
      { value: BACK, label: 'back', hint: 'Choose another playlist' },
      { value: 'remove', label: 'remove', hint: 'Stop tracking it on this machine' },
    ],
    ...asking,
  })

  if (isCancel(action)) return 'quit'
  if (action === BACK) return 'picker'

  // No by default, and `back` sitting above `remove` for the same reason:
  // return is the key a person presses to move through a menu, and both screens
  // between this one and the top are answered with it. Nothing irreversible
  // should be what one more press lands on.
  const sure = await confirm({
    message: askingToStop(playlist),
    initialValue: false,
    ...asking,
  })

  if (isCancel(sure)) return 'quit'
  if (!sure) return 'picker'

  await launch(['remove', playlist.id])

  // Back to the top rather than back to the picker, because the picker was
  // built out of a `list` describing a Mirror this machine no longer has.
  // Offering it again would be the menu showing something no command reported,
  // which is the one thing it may not do. Another `list` is two keystrokes away.
  return 'menu'
}
