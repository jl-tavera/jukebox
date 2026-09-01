import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'bun:test'
import { defineCommand, type CommandDef } from 'citty'
import pkg from '../package.json'
import type { Listed } from '../src/commands/list'
import { LOCAL_ONLY } from '../src/commands/remove'
import { NARROW_MARK } from '../src/header'
import {
  askingToStop,
  ENTRIES,
  FOR_THIS_PLAYLIST,
  THE_ADDRESS,
  WHICH_PLAYLIST,
  WORKING,
} from '../src/menu'
import { failed, succeeded } from '../src/outcome'
import { held, identified, NOTHING_TRACKED } from '../src/phrasing'
import type { MirroredPlaylist } from '../src/reading'
import { ERASED } from '../src/spinner'
import { WORDMARK } from '../src/wordmark'
import {
  CANCEL,
  DOWN,
  ENTER,
  jukebox,
  oneObject,
  removeHomes,
  temporaryHome,
  type Run,
} from './harness'
import { servingItsOwnApi, snapshot, stopServing, track, type Site } from './server'

/**
 * The menu, driven at Seam 3 like every other command in this suite.
 *
 * No seam of its own, and that is a property of where #51 put the input stream
 * rather than a discipline observed here: the keyboard is on `Io`, so an
 * argument vector and some keystrokes is the whole of driving a menu, the same
 * way an argument vector alone is the whole of driving a command.
 *
 * What is asserted is what a person or a script observes -- what lands on
 * stdout, what lands on stderr, and the exit code. Never which screen the menu
 * thinks it is on or how many times it redrew, which are the parts most likely
 * to change and least likely to matter.
 */

afterAll(removeHomes)
afterAll(stopServing)

/**
 * The keys that walk from the top of the menu to one entry and take it.
 *
 * Counted out of `ENTRIES` rather than written down. The order of the menu is
 * that array's to decide, and five positions spelled out here would every one
 * of them retarget in silence the day it changed -- a test meaning to press
 * `sync` would press `list` and still pass. The argument is typed off the same
 * array, so a misspelt entry is a typecheck failure rather than a walk to
 * nowhere.
 */
const taking = (entry: (typeof ENTRIES)[number]['value']): string[] => [
  ...new Array<string>(ENTRIES.findIndex((one) => one.value === entry)).fill(DOWN),
  ENTER,
]

const ADD = taking('add')
const SYNC = taking('sync')
const LIST = taking('list')
const CONFIG = taking('config')

/**
 * Every run below ends with this, and not for tidiness. The harness's keyboard
 * never closes, so a prompt handed too few keys waits rather than fails -- a
 * test that forgets the way out hangs until the runner gives up.
 */
const QUIT = taking('quit')

/**
 * An address typed into the prompt `add` opens, a character at a time.
 *
 * Spread the way `keyboard.test.ts` spreads a typed word, because that is what
 * a terminal sends: a stream that delivered the whole string as one chunk would
 * be testing something no keyboard does.
 */
const typing = (address: string): string[] => [...address, ENTER]

/** The first Playlist the picker offers, which is the one whose id sorts first. */
const FIRST = [ENTER]

/** Past every Playlist to the way back, which the picker puts after them. */
const outOf = (playlists: number): string[] => [...new Array<string>(playlists).fill(DOWN), ENTER]

/** On a Playlist's own screen: the way back is first, and `remove` is second. */
const LEAVE_IT = [ENTER]
const REMOVE_IT = [DOWN, ENTER]

/**
 * What a confirmation takes. A letter answers it at once, with no return behind
 * it, which is the library's own behaviour rather than this suite's.
 */
const YES = 'y'
const NO = 'n'

/** Nowhere, as `list.test.ts` spells it: a session that quietly booted would fail. */
const NO_SITE = 'http://127.0.0.1:1/discovery.json'

/** Short enough for a test suite to watch `add`'s wait run out. */
const BRIEF = { windowMs: 100, intervalMs: 10 }

/** Sorts first, so the picker's first entry is this one. */
const URL = 'https://open.spotify.com/playlist/1AbCdEfGhIjKlMnOpQrStU'
const ID = 'spotify:1AbCdEfGhIjKlMnOpQrStU'

/** A second Playlist, still being read from its Source. Sorts after the first. */
const PENDING = 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n'
const PENDING_ID = 'spotify:3cEYpjA9oz9GiPac4AsH4n'

const twoTracks = snapshot({
  title: 'Rain / Shine',
  tracks: [
    track(),
    track({ sourceTrackId: 'long-way-down', title: 'Long Way Down', position: 1 }),
  ],
})

/**
 * A home holding one Playlist with Tracks and one still being read from its
 * Source, filled by `add` because that is the honest way to fill a Mirror.
 *
 * The server has no part in anything below it. Every menu session in this file
 * is pointed at nowhere, and reaches only commands that read local state.
 */
const twoPlaylists = async (site: Site, name: string): Promise<string> => {
  const home = temporaryHome(name)

  site.tracking(URL, { id: ID, status: 'ok' })
  site.holding(ID, twoTracks)
  await jukebox(['add', URL, '--json'], { discovery: site.url, patience: BRIEF, home })

  site.tracking(PENDING, { id: PENDING_ID, status: 'pending' })
  site.holding(PENDING_ID, 'resolving')
  await jukebox(['add', PENDING, '--json'], { discovery: site.url, patience: BRIEF, home })

  return home
}

/** One command run against a home, the way a shell would run it. */
const against = (home: string, argv: string[]): Promise<Run> =>
  jukebox(argv, { home, discovery: NO_SITE })

/** One menu session against a home, driven by the keys a person would press. */
const session = (home: string, keys: string[]): Promise<Run> =>
  jukebox([], { home, discovery: NO_SITE, keys })

/**
 * The same two, for the two entries that reach the network.
 *
 * Pointed at a site rather than at nowhere, which every other run in this file
 * deliberately is. `add` and `sync` open the one door to the network, so a run
 * that exercises either has to be given something on the other side of it.
 */
const onSite = (site: Site, home: string, argv: string[]): Promise<Run> =>
  jukebox(argv, { home, discovery: site.url, patience: BRIEF })

const sessionAt = (site: Site, home: string, keys: string[]): Promise<Run> =>
  jukebox([], { home, discovery: site.url, patience: BRIEF, keys })

/**
 * The narrowest terminal this file opens a menu on, and so the width a spinner
 * message has to fit inside with a frame and a space in front of it.
 */
const NARROWEST = 40

const listed = (run: Run): Listed => oneObject(run).data as Listed

const idsIn = async (home: string): Promise<string[]> =>
  listed(await against(home, ['list', '--json'])).playlists.map((one) => one.id)

/**
 * The first row of the art, as it has to arrive on stderr.
 *
 * `header` brackets each row in its own escapes rather than wrapping the block,
 * so the row stays one contiguous run of bytes and this matches whether or not
 * the run drew in colour. Nothing here has to strip escapes first.
 */
const ART = WORDMARK.split('\n')[0]!

/** The brand yellow `header` emits, and the only escape this file asserts about. */
const YELLOW = '\x1b[38;2;255;212;0m'

describe('bare jukebox at a terminal', () => {
  it('shows the wordmark, the version and a menu', async () => {
    const run = await jukebox([], { keys: QUIT })

    expect(run.stderr).toContain(ART)
    expect(run.stderr).toContain(`jukebox ${pkg.version}`)

    // Every entry #50 puts at the top level, whether or not this slice wired it
    // up. `show` and `remove` are deliberately not among them -- #56 reaches
    // them through `list`, so the id nobody memorises is never asked for.
    //
    // The hint carries the assertion and the label rides along: `list` is a
    // substring of `playlist`, which `add`'s hint contains, so a menu that drew
    // four entries would still satisfy a check on the labels alone.
    for (const { label, hint } of ENTRIES) {
      expect(run.stderr).toContain(label)
      expect(run.stderr).toContain(hint)
    }
  })

  it('writes every byte of it to stderr', async () => {
    const run = await jukebox([], { keys: QUIT })

    // The whole of why a menu can exist at all without costing the guarantee
    // `render.ts` makes. stdout is data, and a session that produced no data
    // produced nothing -- not a wordmark, not a prompt, not a redraw.
    expect(run.stdout).toBe('')
  })

  it('exits zero when the person quits', async () => {
    // A session rather than an answer. Exit codes exist for callers, and the
    // entry condition guarantees no caller is here.
    expect((await jukebox([], { keys: QUIT })).code).toBe(0)
  })

  it('leaves on ctrl-c the same way, and says nothing different about it', async () => {
    // In raw mode Ctrl-C is not a signal: the byte reaches the program and the
    // program decides. It decides the same thing `quit` does, because it is how
    // a person says they are finished, and answering it with a failure would
    // make the ordinary way out look like a fault.
    //
    // One key is the whole script. If the loop ever redrew on a cancel instead
    // of returning, this hangs rather than fails -- which is the failure this
    // suite is built to make loud, and the reason the assertion is here at all.
    const run = await jukebox([], { keys: [CANCEL] })

    expect(run.stdout).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('an entry this slice has not wired up', () => {
  it('says what to run instead, and comes back to the menu', async () => {
    // Down three to `config`, which #57 takes and which is the last one left.
    // Reaching `quit` at all is the proof that it did come back: the second
    // press of return has nothing to land on otherwise, and the run hangs.
    const run = await jukebox([], { keys: [...CONFIG, ...QUIT] })

    expect(run.stderr).toContain('not in the menu yet')
    expect(run.stderr).toContain('jukebox config')
    expect(run.stdout).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('the wordmark at the width it is given', () => {
  it('draws the art on a terminal wide enough for it', async () => {
    const run = await jukebox([], { columns: 100, keys: QUIT })

    expect(run.stderr).toContain(ART)
  })

  it('draws the word on one that is not', async () => {
    const run = await jukebox([], { columns: NARROWEST, keys: QUIT })

    // Five rows of 67 columns wrapped into a 40-column window is not a smaller
    // mark, it is confetti.
    expect(run.stderr).not.toContain(ART)
    expect(run.stderr).toContain(NARROW_MARK)
  })
})

describe("the wordmark's colour", () => {
  it('is suppressed when the stream it is drawn on is not a terminal', async () => {
    // `jukebox 2>log.txt` at a terminal. The menu still opens, because #50
    // gates that on stdout and stdin -- so the art has to reach the file as
    // bytes somebody can read rather than as escape sequences.
    //
    // Only the brand escape is asserted absent. The prompt library writes
    // cursor moves and colours of its own whatever this run decided, so a
    // blanket check for any escape at all would be asserting something this
    // ticket does not control.
    const run = await jukebox([], { stderrTty: false, keys: QUIT })

    expect(run.stderr).toContain(ART)
    expect(run.stderr).not.toContain(YELLOW)
  })

  // No test asserts the escape is *present*. Whether colour is supported is
  // computed by the colour library from the real process, once, at import --
  // true on Windows, true under CI, and false for somebody piping this suite on
  // Linux. Asserting presence here would pass or fail by platform. That branch
  // is covered where it can be: `header.test.ts` hands the boolean in.
})

describe('everywhere a menu must not open', () => {
  /**
   * No keys anywhere below. Nothing here should reach a prompt to consume them.
   *
   * Two shapes rather than one, because the refusal is rendered by whichever
   * mode the run is in and the two cases genuinely differ: something parsing
   * the output is handed the envelope on stdout, and somebody reading it is
   * handed the sentence on stderr. Both are `invalid_usage` and both exit 1.
   */
  const refusedAsJson = (run: { stdout: string; code: number }) => {
    expect(oneObject(run)).toMatchObject({
      ok: false,
      command: 'jukebox',
      error: { code: 'invalid_usage' },
    })
    expect(run.code).toBe(1)
  }

  const refusedInWords = (run: { stdout: string; stderr: string; code: number }) => {
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('No command given')
    expect(run.code).toBe(1)
  }

  it('fails in a pipe or a redirect, exactly as it did before', async () => {
    refusedAsJson(await jukebox([], { tty: false }))
  })

  it('fails when nobody is at the keyboard', async () => {
    // A CI job or a cron entry. Asking here is not a slow command, it is a hung
    // one, so a missing answer has to be an error rather than a wait.
    //
    // In words rather than as an envelope: stdout is still a terminal here, so
    // this run is still rendering for a person. Only the keyboard is missing.
    refusedInWords(await jukebox([], { stdin: false }))
  })

  it('fails when JSON was asked for, both streams terminals or not', async () => {
    // The output is being parsed. A menu drawn into it is neither answerable
    // nor valid JSON.
    refusedAsJson(await jukebox(['--json']))
  })

  it('fails on a vector that names no command but is not bare', async () => {
    // `--nonsense` resolves to no command the same way an empty vector does,
    // and must not be answered with a menu that silently swallowed the flag.
    // This is the case the entry condition reads `argv.length` for rather than
    // asking the dispatcher what it found.
    refusedInWords(await jukebox(['--nonsense']))
  })
})

/**
 * The reason the menu is worth building: `list`, and the two commands reached
 * through it.
 *
 * `show` and `remove` both take an id that only `list` prints, so using either
 * from a shell means running a different command first and copying a string
 * back onto the command line. Here the id is never asked for -- and the picker
 * that replaces it is built out of what `list` reported, which is what keeps
 * the menu from becoming a second reader of local state that can disagree with
 * the command.
 */
describe('the playlists this Mirror holds', () => {
  it('offers every one that `list` reports, with its status and what it holds', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-picker-')

    const run = await session(home, [...LIST, ...outOf(2), ...QUIT])

    // Composed out of the command's own answer rather than written out again
    // here. A picker built from anything else could disagree with `jukebox
    // list` about what is tracked, what its status is or how much it holds, and
    // the disagreement would read as a bug in the command -- which is the drift
    // ADR-0007 exists to make impossible.
    const { playlists } = listed(await against(home, ['list', '--json']))
    expect(playlists).toHaveLength(2)

    for (const playlist of playlists) {
      const name = identified(playlist.title, playlist.id)
      expect(run.stderr).toContain(`${name}, ${playlist.status}, ${held(playlist)}`)
    }

    expect(run.code).toBe(0)
  })

  it('tells one still being read from its source apart from one that is settled', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-status-')

    const run = await session(home, [...LIST, ...outOf(2), ...QUIT])

    // On the label rather than in a hint, because the library draws a hint only
    // for the entry a person is standing on, and telling one Playlist from
    // another is what somebody came to this screen to do.
    //
    // The word rather than a colour: `NO_COLOR`, a redirected stream and a
    // terminal that cannot colour all still have to distinguish them, and the
    // word is the one `list` prints and `--json` carries, so a reader who goes
    // looking has the string they would have to match on.
    //
    // One status stands for the three that are not `ok`. Nothing in `offer`
    // branches on which it is -- the word is copied out of the row -- so a Gone
    // or an Unreachable Playlist reaches the screen down the same line of code.
    expect(run.stderr).toContain(`${identified(null, PENDING_ID)}, pending, no tracks`)
    expect(run.stderr).toContain(`${identified('Rain / Shine', ID)}, ok, 2 tracks`)
  })

  it('shows the one that was picked, exactly as `show` does', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-show-')

    const run = await session(home, [...LIST, ...FIRST, ...LEAVE_IT, ...outOf(2), ...QUIT])

    // The launcher rule, asserted the only way worth asserting it: what the
    // session put on stdout is what the two commands put there, in order and to
    // the byte. A menu that had grown a screen of its own could not pass this.
    const listing = await against(home, ['list'])
    const showing = await against(home, ['show', ID])

    expect(run.stdout).toBe(listing.stdout + showing.stdout)
  })

  it('stops tracking from that screen, exactly as `remove` does', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-remove-')
    const twin = await twoPlaylists(site, 'jukebox-menu-remove-twin-')

    const run = await session(home, [...LIST, ...FIRST, ...REMOVE_IT, YES, ...QUIT])

    // Against a second home rather than the same one, because the command being
    // compared with deletes what it is run against and there is only one of it
    // to delete. The two homes were filled identically, and what `remove`
    // prints carries no clock.
    const removing = await against(twin, ['remove', ID])

    expect(run.stdout).toEndWith(removing.stdout)
    expect(await idsIn(home)).toEqual([PENDING_ID])
  })

  it('asks before it deletes anything, and keeps it when the answer is no', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-confirm-')

    const run = await session(home, [
      ...LIST,
      ...FIRST,
      ...REMOVE_IT,
      NO,
      ...outOf(2),
      ...QUIT,
    ])

    // Both pinned rather than paraphrased: the question is the menu's and is
    // exported for this, and the sentence that would have followed a deletion
    // is `remove`'s own, exported for the same reason.
    const asked = listed(await against(home, ['list', '--json'])).playlists[0]!
    expect(run.stderr).toContain(askingToStop(asked))
    expect(run.stdout).not.toContain(LOCAL_ONLY)

    expect(await idsIn(home)).toEqual([ID, PENDING_ID])
  })
})

/**
 * The invariant the whole ticket rests on, tested where it can only be tested:
 * against a `list` reporting something no Mirror holds.
 *
 * Everything above compares the menu with the real command over a real Mirror,
 * which a picker that had gone and read the Mirror itself would pass just as
 * well. This is the shape that tells the two apart, and it is one the real
 * program cannot produce -- which is what `Seams.root` is for.
 */
describe('a picker built from what `list` returned', () => {
  /** A Playlist no Mirror holds, in the shape `list` reports one in. */
  const INVENTED: MirroredPlaylist = {
    id: 'spotify:inventedInventedInvent',
    url: 'https://open.spotify.com/playlist/inventedInventedInvent',
    title: 'Invented',
    status: 'ok',
    folderName: 'Invented',
    lastVersion: 1,
    skipped: 0,
    lastSyncedAt: null,
    tracks: 3,
    removed: 0,
  }

  /** What this tree's `show` says instead of showing anything. */
  const NOTHING_TO_SHOW = 'There is nothing to show for that one.'

  /**
   * A `list` that reports whatever it is handed, and a `show` that cannot show
   * it. Both are things the real commands can never be -- a report that
   * disagrees with local state, and a Playlist that lists but will not show.
   */
  const reporting = (playlists: MirroredPlaylist[]): CommandDef =>
    defineCommand({
      meta: { name: 'jukebox' },
      subCommands: {
        list: defineCommand({
          meta: { name: 'list', description: 'Reports whatever it was handed' },
          run: () => succeeded('list', { playlists }, () => 'reported'),
        }),
        show: defineCommand({
          meta: { name: 'show', description: 'Refuses' },
          run: () => failed('show', 'playlist_not_tracked', NOTHING_TO_SHOW),
        }),
      },
    })

  it('offers what the command reported, and not what the Mirror holds', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-derived-')

    const run = await jukebox([], {
      home,
      discovery: NO_SITE,
      root: reporting([INVENTED]),
      keys: [...LIST, ...outOf(1), ...QUIT],
    })

    expect(run.stderr).toContain(`${identified(INVENTED.title, INVENTED.id)}, ok, 3 tracks`)

    // The two this home really tracks, and the assertion a second reader of
    // local state would fail: it would have offered these instead.
    expect(run.stderr).not.toContain(ID)
    expect(run.stderr).not.toContain(PENDING_ID)
    expect(run.code).toBe(0)
  })

  it('does not offer to stop tracking one that would not show', async () => {
    const run = await jukebox([], {
      home: temporaryHome('jukebox-menu-unshowable-'),
      discovery: NO_SITE,
      root: reporting([INVENTED]),
      keys: [...LIST, ...FIRST, ...outOf(1), ...QUIT],
    })

    // Straight back to the picker, with the reason on the screen. Offering to
    // stop tracking a Playlist that would not show is offering to do the thing
    // that has just failed -- and where a second terminal is what removed it,
    // that is precisely what failed.
    expect(run.stderr).toContain(NOTHING_TO_SHOW)
    expect(run.stderr).not.toContain(FOR_THIS_PLAYLIST)
    expect(run.code).toBe(0)
  })
})

describe('a Mirror with nothing in it', () => {
  it('is said in words rather than shown as an empty picker', async () => {
    const home = temporaryHome('jukebox-menu-empty-')

    const run = await session(home, [...LIST, ...QUIT])

    // The sentence is `list`'s own, and it points at `add`. A picker with
    // nothing in it would be a screen offering a person nothing to do.
    expect(run.stdout.trim()).toBe(NOTHING_TRACKED)
    expect(run.stderr).not.toContain(WHICH_PLAYLIST)
    expect(run.code).toBe(0)
  })
})

describe('a command that fails inside a session', () => {
  it('says why, comes back to the menu, and the session still exits zero', async () => {
    const run = await jukebox([], {
      discovery: NO_SITE,
      // A file where the data directory has to go, as `mirror.test.ts` does it:
      // the cheapest way to make a real command fail for a real reason.
      prepare: (where) => void writeFileSync(where.data, 'not a directory\n'),
      keys: [...LIST, ...QUIT],
    })

    expect(run.stderr).toContain('could not open its local record')

    // Reaching `quit` at all is the proof it came back: the keys after the
    // failure have nothing to land on otherwise, and the run hangs.
    expect(run.stdout).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('adding a playlist from the menu', () => {
  it('prompts for an address and answers exactly as `add` does', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    // A home each, rather than one shared. `add` is the entry that changes what
    // the next run of it would answer, so the two runs have to start from the
    // same place -- and nothing `add` prints names a home, which is what makes
    // two of them comparable at all.
    const shell = await onSite(site, temporaryHome('jukebox-menu-add-shell-'), ['add', URL])
    const run = await sessionAt(site, temporaryHome('jukebox-menu-add-picked-'), [
      ...ADD,
      ...typing(URL),
      ...QUIT,
    ])

    // The launcher rule, asserted the only way worth asserting it: what the
    // session put on stdout is what the command put there, to the byte. A menu
    // that had grown an adding screen of its own could not pass this.
    expect(run.stdout).toBe(shell.stdout)
    expect(run.stdout).not.toBe('')
  })

  it('asks for the address on stderr, and keeps stdout for the answer', async () => {
    const site = servingItsOwnApi()
    site.tracking(URL, { id: ID, status: 'ok' })
    site.holding(ID, twoTracks)

    const home = temporaryHome('jukebox-menu-add-streams-')
    const run = await sessionAt(site, home, [...ADD, ...typing(URL), ...QUIT])

    // The question and the spinner are chrome, and chrome is on stderr. The one
    // thing on stdout is what `add` computed.
    expect(run.stderr).toContain(THE_ADDRESS)
    expect(run.stderr).toContain(WORKING.add)
    expect(run.stdout).toContain('Rain / Shine')
    expect(run.stdout).not.toContain(WORKING.add)
  })

  it('says why an address was refused, and comes back to the menu', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-menu-add-refused-')

    // Nothing is tracked for this address, and the site refuses anything it was
    // not told about -- the same answer the real API gives a URL no Source
    // claims.
    //
    // `list` after it, and that is the assertion rather than a flourish.
    // Reaching `quit` proves nothing on its own: the harness's keyboard is
    // pushed full up front and never ends, so keys nobody reads are dropped and
    // a session that had closed on the failure would finish just as quietly. A
    // command answering on stdout afterwards is what says the menu came back
    // and was still usable.
    const keys = [...ADD, ...typing('not-an-address'), ...LIST, ...QUIT]
    const run = await sessionAt(site, home, keys)

    expect(run.stderr).toContain('does not look like a playlist')
    expect(run.stdout.trim()).toBe(NOTHING_TRACKED)
    expect(run.code).toBe(0)
  })

  it('goes back to the menu on an empty answer, without asking the API about it', async () => {
    const site = servingItsOwnApi()
    const home = temporaryHome('jukebox-menu-add-empty-')

    const run = await sessionAt(site, home, [...ADD, ENTER, ...QUIT])

    // The way back, on the one screen with nowhere to put one as an entry.
    // Launching the empty answer instead would be a request asking the API to
    // recognise nothing, and this is what says none was made -- the boot is
    // lazy, so a session that reached no command reached no network either.
    expect(site.asked).toEqual([])
    expect(run.stdout).toBe('')
    expect(run.code).toBe(0)
  })
})

describe('syncing from the menu', () => {
  it('answers exactly as `sync` does', async () => {
    const site = servingItsOwnApi()

    // A home each, as the `add` comparison above uses, so that neither run can
    // be answering differently for having gone second. Both Mirrors hold the
    // same two Playlists and the site answers both the same way: the one
    // holding Tracks revalidates to a 304, the one still being read stays being
    // read. Swapping the two lines below is a no-op, which is what says the
    // assertion is about where a command was run from and nothing else.
    const typed = await twoPlaylists(site, 'jukebox-menu-sync-shell-')
    const picked = await twoPlaylists(site, 'jukebox-menu-sync-picked-')

    const run = await sessionAt(site, picked, [...SYNC, ...QUIT])
    const shell = await onSite(site, typed, ['sync'])

    expect(run.stdout).toBe(shell.stdout)
    expect(run.stdout).not.toBe('')
  })

  it('draws a spinner over it, on stderr', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-sync-spinner-')

    const run = await sessionAt(site, home, [...SYNC, ...QUIT])

    // #50 wants it because a Sync over a dozen Playlists is the one thing this
    // tool does that can look like a hang. It is chrome, so it is on stderr and
    // the report is not.
    expect(run.stderr).toContain(WORKING.sync)
    expect(run.stdout).not.toContain(WORKING.sync)
  })

  it('has cleared the spinner off the line before the report is written', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-sync-order-')

    const run = await sessionAt(site, home, [...SYNC, ...QUIT])

    // The whole of why `Launch` carries a `computed`, and the one property
    // stdout and stderr cannot be asked about: they are two strings, and both
    // of them reach one terminal. A launch is compute *and* render, so a
    // spinner stopped when the launch returned would still have been on the
    // line while the report was written, and its next frame would erase the
    // report's first line.
    const report = run.interleaved.findIndex((text) => text.includes('nothing changed'))
    const before = run.interleaved.slice(0, report)
    const lastFrame = before.map((text) => text.includes(WORKING.sync)).lastIndexOf(true)

    expect(report).toBeGreaterThan(-1)
    expect(lastFrame).toBeGreaterThan(-1)

    // Drawn, then cleared, then answered -- in that order, and the clearing
    // found inside what was written before the report rather than after it.
    // `computed?.()` removed from `main` is exactly this going to -1.
    expect(before.indexOf(ERASED, lastFrame + 1)).toBeGreaterThan(-1)
  })

  it('keeps every spinner message to one line a narrow terminal can hold', () => {
    // `spinner.ts` erases the row the cursor is on and no other, so a message
    // long enough to wrap would leave its first rows on the screen when it
    // stopped. This file is where that stays true, and the width is the
    // narrowest one it opens a menu on above.
    for (const working of Object.values(WORKING)) {
      expect(working).not.toContain('\n')
      expect(working.length + 2).toBeLessThanOrEqual(NARROWEST)
    }
  })
})

describe('a backend that will not serve this binary', () => {
  it('closes the menu and exits non-zero', async () => {
    const site = servingItsOwnApi({ min_version: '99.0.0' })
    const home = temporaryHome('jukebox-menu-refused-')

    // The keys go on to `list`, which touches no network and would have
    // answered on stdout had the menu come back. #50 names this as the one
    // exception to a session exiting zero: nothing in it was usable, so there
    // is no menu worth coming back to, and an empty stdout is what says so.
    const run = await sessionAt(site, home, [...SYNC, ...LIST, ...QUIT])

    expect(run.stderr).toContain('Upgrade to the latest release')
    expect(run.stdout).toBe('')
    expect(run.code).toBe(1)
  })

  it('closes it on an add just the same', async () => {
    const site = servingItsOwnApi({ min_version: '99.0.0' })
    const home = temporaryHome('jukebox-menu-refused-add-')

    // The two entries reach the gate through the same helper, and each decides
    // for itself what to do with the answer. That is two lines rather than one,
    // so it is two tests rather than one.
    const run = await sessionAt(site, home, [...ADD, ...typing(URL), ...LIST, ...QUIT])

    expect(run.stderr).toContain('Upgrade to the latest release')
    expect(run.stdout).toBe('')
    expect(run.code).toBe(1)
  })
})

describe('a backend that is down or unreachable', () => {
  it('says so, comes back, and leaves the entries reading local state working', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-offline-')

    // Pointed at nowhere, and at an address this home has no saved document
    // for, so the boot has nothing to fall back on. That is what a network that
    // is down looks like from inside the CLI.
    const run = await session(home, [...SYNC, ...LIST, ...outOf(2), ...QUIT])
    const listing = await against(home, ['list'])

    expect(run.stderr).toContain('does not know where the API is')

    // The half of it that matters. `list` reads only local state, so an
    // unreachable backend costs the session the two entries that needed one and
    // nothing else -- and the session it cost them in still ends zero.
    expect(run.stdout).toBe(listing.stdout)
    expect(run.code).toBe(0)
  })

  it('prints an outage message verbatim and carries on the same way', async () => {
    const site = servingItsOwnApi()
    const home = await twoPlaylists(site, 'jukebox-menu-down-')

    // A second site, serving the kill switch, because the first one had to be
    // healthy for the Mirror above to be filled at all. Pointing the session at
    // a different address is also what makes the boot ask rather than answer
    // from the copy `twoPlaylists` left behind: the saved document is keyed on
    // where it came from, and is fresh for an hour.
    const down = servingItsOwnApi({ status: 'down', message: 'Back in an hour.' })

    const run = await sessionAt(down, home, [...SYNC, ...LIST, ...outOf(2), ...QUIT])
    const listing = await against(home, ['list'])

    // Verbatim is what the field is for, and it is why that copy can improve
    // without a client release.
    expect(run.stderr).toContain('Back in an hour.')
    expect(run.stdout).toBe(listing.stdout)
    expect(run.code).toBe(0)
  })
})
