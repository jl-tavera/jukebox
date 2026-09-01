import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'bun:test'
import { defineCommand, type CommandDef } from 'citty'
import pkg from '../package.json'
import { shown } from '../src/commands/config'
import type { Listed } from '../src/commands/list'
import { LOCAL_ONLY } from '../src/commands/remove'
import {
  CONFIG_FILE,
  INTERVAL_VARIABLE,
  KNOWN,
  LIBRARY_VARIABLE,
  NOTE,
  type Configured,
  type SettingKey,
} from '../src/config'
import { header, NARROW_MARK } from '../src/header'
import {
  askingFor,
  askingToStop,
  ENTRIES,
  FOR_THIS_PLAYLIST,
  THE_ADDRESS,
  WHICH_PLAYLIST,
  WHICH_SETTING,
  WORKING,
} from '../src/menu'
import { failed, succeeded } from '../src/outcome'
import { MINIMUM_BELOW, region, RELEASED } from '../src/pinned'
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

/** Past every entry a picker offers to the way back, which both pickers put after them. */
const outOf = (playlists: number): string[] => [...new Array<string>(playlists).fill(DOWN), ENTER]

/** On a Playlist's own screen: the way back is first, and `remove` is second. */
const LEAVE_IT = [ENTER]
const REMOVE_IT = [DOWN, ENTER]

/**
 * The keys that walk from the top of the settings picker to one setting and
 * take it, and the keys that walk past every setting to the way back.
 *
 * Counted out of `KNOWN` for the reason `taking` is counted out of `ENTRIES`:
 * the order of that picker is that array's to decide, and a position written
 * down here would retarget in silence the day a third setting arrived. The
 * argument is typed off the same array, so a misspelt key is a typecheck
 * failure rather than a walk to nowhere.
 */
const settingAt = (key: SettingKey): string[] => [
  ...new Array<string>(KNOWN.indexOf(key)).fill(DOWN),
  ENTER,
]

const OUT_OF_SETTINGS = outOf(KNOWN.length)

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

/** The settings a run reported, as `listed` above is for the Playlists. */
const settingsIn = (run: Run): Configured => oneObject(run).data as Configured

/**
 * One run's answer with the home it was given taken out of it.
 *
 * The `add` comparison below notes that nothing that command prints names a
 * home, "which is what makes two of them comparable at all". `config` names one
 * in every answer it gives -- where the file would be, and where a line was
 * written to -- so two runs over two homes differ by exactly that string and by
 * nothing else. `musicDirectory` reads the real profile rather than the home a
 * run was handed, so the default Library path is not a second one of these.
 *
 * Taking it out is what makes the launcher rule assertable for the one entry
 * that prints a path it also writes to. Leaving it in would mean asserting
 * something weaker about the only entry that changes anything on this machine.
 */
const anywhere = ({ stdout, locations }: Run): string =>
  stdout.replaceAll(locations.config, '<a configuration directory>')

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

/**
 * The last entry #50 puts at the top level, and the one whose local state has
 * nothing to do with a Playlist.
 *
 * `config` reaches no network at all, so every run below is a plain `session`
 * pointed at nowhere -- the same nowhere that would make a booting command warn
 * or stop, which is what says this entry never opens that door.
 */
describe('the settings this machine has', () => {
  it('shows every setting exactly as `config` does', async () => {
    const home = temporaryHome('jukebox-menu-config-show-')

    const run = await session(home, [...CONFIG, ...OUT_OF_SETTINGS, ...QUIT])

    // The launcher rule, asserted the only way worth asserting it: what the
    // session put on stdout is what the command put there, to the byte. One
    // home for both, because showing settings writes nothing.
    const shell = await against(home, ['config'])

    expect(run.stdout).toBe(shell.stdout)
    expect(run.stdout).not.toBe('')
    expect(run.code).toBe(0)
  })

  it('offers every setting with its value and where that value came from', async () => {
    const home = temporaryHome('jukebox-menu-config-picker-')

    const run = await session(home, [...CONFIG, ...OUT_OF_SETTINGS, ...QUIT])

    // Composed out of the command's own answer rather than written out again
    // here, as the Playlist picker's is -- and by the command's own function,
    // which is what stops the picker and the table above it phrasing an origin
    // two different ways.
    const { settings } = settingsIn(await against(home, ['config', '--json']))

    for (const { key, value, from } of shown(settings)) {
      expect(run.stderr).toContain(`${key}, ${value} (${from})`)
    }

    expect(run.code).toBe(0)
  })

  it('names the variable behind a value the environment supplied', async () => {
    const run = await jukebox([], {
      home: temporaryHome('jukebox-menu-config-shadowed-'),
      discovery: NO_SITE,
      env: { [LIBRARY_VARIABLE]: '/mnt/elsewhere' },
      keys: [...CONFIG, ...OUT_OF_SETTINGS, ...QUIT],
    })

    // On the row itself, where somebody is standing when they decide whether to
    // change it. The command says as much in the table above and again in the
    // warning after a write; this is the only one of the three in front of them
    // before they type anything.
    expect(run.stderr).toContain(`library_path, /mnt/elsewhere (environment: ${LIBRARY_VARIABLE})`)
  })

  it('changes a setting exactly as the command does', async () => {
    const home = temporaryHome('jukebox-menu-config-set-')
    const twin = temporaryHome('jukebox-menu-config-set-twin-')

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('sync_interval_hours'),
      ...typing('6'),
      ...QUIT,
    ])

    // Against a second home rather than the same one, as the `remove`
    // comparison is: the command being compared with writes to what it is run
    // against, and the session has already written to the first. Both start
    // empty, and the pair runs in the order the session ran them in.
    const showing = await against(twin, ['config'])
    const writing = await against(twin, ['config', 'sync_interval_hours', '6'])

    expect(anywhere(run)).toBe(anywhere(showing) + anywhere(writing))
    expect(run.code).toBe(0)
  })

  it('leaves the setting in the file, where the next run reads it', async () => {
    const home = temporaryHome('jukebox-menu-config-persisted-')

    await session(home, [...CONFIG, ...settingAt('sync_interval_hours'), ...typing('6'), ...QUIT])

    // The half the comparison above cannot make: two runs printing the same
    // words would both pass it having written nothing at all.
    const { settings } = settingsIn(await against(home, ['config', '--json']))

    expect(settings.sync_interval_hours).toEqual({ value: 6, origin: 'file' })
  })

  it('carries a value with spaces in it through, where a shell needs quoting', async () => {
    const home = temporaryHome('jukebox-menu-config-spaced-')
    const spaced = 'D:\\My Music\\Jukebox'

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('library_path'),
      ...typing(spaced),
      ...QUIT,
    ])

    // The one thing this door does that the other cannot. `config.test.ts`
    // refuses three words rather than write a truncated path, because a shell
    // splits an unquoted one; a prompt hands over the whole line, so a vector
    // built from it carries two positionals whatever is in them. The bytes
    // rather than the reported value, for that file's reason: TOML is the
    // format here partly because it spells this without escaping.
    expect(readFileSync(join(run.locations.config, CONFIG_FILE), 'utf8')).toContain(
      `library_path = '${spaced}'`,
    )
    expect(run.code).toBe(0)
  })

  it('says the environment still wins, when it does', async () => {
    const run = await jukebox([], {
      home: temporaryHome('jukebox-menu-config-shadow-'),
      discovery: NO_SITE,
      env: { [LIBRARY_VARIABLE]: '/mnt/elsewhere' },
      keys: [...CONFIG, ...settingAt('library_path'), ...typing('/srv/music'), ...QUIT],
    })

    // #50 asks for this warning in the menu by name, and it arrives without the
    // menu doing anything: it rides out in the command's result object, folded
    // into the text of an answer that succeeded, so it lands on stdout beside
    // the receipt rather than with the chrome.
    expect(run.stdout).toContain(LIBRARY_VARIABLE)
    expect(run.stdout).toContain('/mnt/elsewhere')
    expect(run.code).toBe(0)
  })

  it('warns that audio already downloaded stays where it is', async () => {
    const home = temporaryHome('jukebox-menu-config-moved-')

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('library_path'),
      ...typing('/srv/music'),
      ...QUIT,
    ])

    // Both sentences together, as `config.test.ts` asserts them: the warning is
    // the policy, and `NOTE` is why the policy costs nothing today.
    expect(run.stdout).toContain('stays there')
    expect(run.stdout).toContain(NOTE)
  })

  it('says why a value was refused, and stays on the settings to try again', async () => {
    const home = temporaryHome('jukebox-menu-config-refused-')

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('sync_interval_hours'),
      ...typing('daily'),
      // The assertion rather than a flourish. A refusal wrote nothing, so the
      // picker still describes the file and the screen stays on it -- and these
      // keys land on that picker. Had a refusal gone back to the top instead,
      // this walk would have taken `sync` and no receipt could reach stdout.
      ...settingAt('sync_interval_hours'),
      ...typing('6'),
      ...QUIT,
      // Behind the way out, so that a menu which went somewhere other than this
      // test expects fails on an assertion rather than by running out of keys
      // inside a prompt and hanging until the runner gives up.
      CANCEL,
    ])

    expect(run.stderr).toContain('whole number of hours')
    expect(run.stdout).toContain('sync_interval_hours = 6')
    expect(run.code).toBe(0)
  })

  it('writes nothing at all for a value it refused', async () => {
    const home = temporaryHome('jukebox-menu-config-unwritten-')

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('sync_interval_hours'),
      ...typing('daily'),
      ...OUT_OF_SETTINGS,
      ...QUIT,
    ])

    // The other half of what `config.test.ts` asserts about a refusal, made
    // about the menu: nothing written, not even a part file, and no
    // configuration directory brought into existence to hold one.
    expect([...new Bun.Glob('**/*').scanSync(home)]).toEqual([])
    expect(run.code).toBe(0)
  })

  it('goes back to the settings on an empty answer', async () => {
    const home = temporaryHome('jukebox-menu-config-empty-')

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('library_path'),
      ENTER,
      // The way out of the picker this went back to. At the top of the menu the
      // same presses take `list`, which would put its own sentence on stdout --
      // so the comparison below is what tells the two apart.
      ...OUT_OF_SETTINGS,
      ...QUIT,
      CANCEL,
    ])

    const shell = await against(home, ['config'])

    expect(run.stdout).toBe(shell.stdout)
    expect([...new Bun.Glob('**/*').scanSync(home)]).toEqual([])
  })

  it('asks on stderr, and keeps stdout for what the command answered', async () => {
    const home = temporaryHome('jukebox-menu-config-streams-')

    const run = await session(home, [
      ...CONFIG,
      ...settingAt('sync_interval_hours'),
      ...typing('6'),
      ...QUIT,
    ])

    expect(run.stderr).toContain(WHICH_SETTING)
    expect(run.stderr).toContain(askingFor('sync_interval_hours'))
    expect(run.stdout).not.toContain(WHICH_SETTING)
    expect(run.stdout).toContain('sync_interval_hours = 6')
  })
})

/**
 * The same invariant `list`'s picker is held to, tested the same way: against a
 * `config` reporting something no machine is configured with.
 *
 * Every comparison above would pass just as well for a screen that had gone and
 * read the configuration file itself, because the file and the command agree.
 * This is the shape that tells the two apart, and it is one the real program
 * cannot produce -- which is what `Seams.root` is for.
 */
describe('a picker built from what `config` returned', () => {
  /** A configuration no machine has, in the shape `config` reports one in. */
  const INVENTED: Configured = {
    settings: {
      library_path: { value: '/invented/library', origin: 'file' },
      sync_interval_hours: { value: 99, origin: 'environment' },
    },
    problems: [],
    file: { path: '/invented/config.toml', state: 'read' },
    note: NOTE,
  }

  /** A `config` reporting whatever it was handed, whatever this host resolves to. */
  const reporting = (reported: Configured): CommandDef =>
    defineCommand({
      meta: { name: 'jukebox' },
      subCommands: {
        config: defineCommand({
          meta: { name: 'config', description: 'Reports whatever it was handed' },
          run: () => succeeded('config', reported, () => 'reported'),
        }),
      },
    })

  it('offers what the command reported, and not what this machine resolves to', async () => {
    const run = await jukebox([], {
      home: temporaryHome('jukebox-menu-config-derived-'),
      discovery: NO_SITE,
      root: reporting(INVENTED),
      keys: [...CONFIG, ...OUT_OF_SETTINGS, ...QUIT],
    })

    expect(run.stderr).toContain('library_path, /invented/library (file)')
    expect(run.stderr).toContain(`sync_interval_hours, 99 (environment: ${INTERVAL_VARIABLE})`)

    // What a home nobody has touched really resolves to, and the assertion a
    // second reader of local state would fail: both of its rows would say this.
    expect(run.stderr).not.toContain('(default)')
    expect(run.code).toBe(0)
  })
})

/**
 * The mark held still, which is #66 and the one piece of chrome that outlives
 * the write that drew it.
 *
 * Everything here is asserted about the escape sequences on stderr, because that
 * is what a person's terminal is actually handed. Where the region starts is
 * counted off the header rather than written down: the mark is five rows and a
 * version line today, and a number spelled out here would go quietly wrong the
 * day either changed.
 */
describe('the wordmark, held still', () => {
  /** The rows the mark and its blank line occupy, at a given width. */
  const heightAt = (columns: number): number =>
    header(columns, pkg.version, false).split('\n').length + 1

  /** The first row that may scroll, which is the one under all of that. */
  const firstScrolling = (columns: number): number => heightAt(columns) + 1

  it('fences the rows under it, and gives them back on the way out', async () => {
    const run = await jukebox([], { keys: QUIT })

    // The region set while the menu is up, and released before the shell gets
    // its terminal back. A session that set one and did not release it would
    // leave the next command scrolling inside a frame this drew, which is the
    // one failure here nobody could undo by looking at it.
    expect(run.stderr).toContain(region(firstScrolling(80), 24))
    expect(run.stderr).toEndWith(RELEASED)
    expect(run.code).toBe(0)
  })

  it('gives them back when the session is left with a cancel', async () => {
    // The other way out, and the one that does not pass through `quit`. Ctrl-C
    // returns from inside a prompt, so the release has to be in the `finally`
    // rather than beside the return -- this is what says it is.
    const run = await jukebox([], { keys: [CANCEL] })

    expect(run.stderr).toEndWith(RELEASED)
    expect(run.code).toBe(0)
  })

  it('holds while a command answers underneath it', async () => {
    const home = temporaryHome('jukebox-menu-pinned-under-')

    const run = await session(home, [...CONFIG, ...OUT_OF_SETTINGS, ...QUIT])

    // The claim everything else here rests on prose for, and the reason the pin
    // is worth anything: a result written to stdout scrolls inside a region set
    // on stderr, because a region belongs to the terminal rather than to either
    // stream and both reach the same one.
    //
    // Order is the only way to ask it, and the two strings cannot answer a
    // question about order because they are two -- which is what `interleaved`
    // is for. `NOTE` is the marker because `config` writes it and no chrome
    // does, so finding it is finding the moment stdout was written to.
    const fenced = run.interleaved.findIndex((text) =>
      text.includes(region(firstScrolling(80), 24)),
    )
    const answered = run.interleaved.findIndex((text) => text.includes(NOTE))
    const given = run.interleaved.findIndex((text) => text.includes(RELEASED))

    expect(fenced).toBeGreaterThan(-1)
    expect(answered).toBeGreaterThan(fenced)
    expect(given).toBeGreaterThan(answered)
    expect(run.stdout).toContain(NOTE)
  })

  it('keeps every byte of it off stdout', async () => {
    const run = await jukebox([], { keys: QUIT })

    // The same guarantee the wordmark itself is held to. A region is chrome, and
    // an escape sequence on stdout is the one thing that would survive a pipe.
    expect(run.stdout).toBe('')
  })

  it('writes none of it to an error stream that is not a terminal', async () => {
    // `jukebox 2>log.txt` at a console. The mark still has to arrive as bytes
    // somebody can read, and a scroll region written into a file is neither
    // readable nor undone by anything.
    const run = await jukebox([], { stderrTty: false, keys: QUIT })

    expect(run.stderr).toContain(ART)
    expect(run.stderr).not.toContain(region(firstScrolling(80), 24))
    expect(run.stderr).not.toContain(RELEASED)
  })

  it('draws the mark once on a terminal with no room to hold it', async () => {
    // One row short of what `MINIMUM_BELOW` asks for. A frame around a menu with
    // nowhere to answer is worse than the unpinned header every session drew
    // before #66, so this falls back to exactly that.
    const run = await jukebox([], { rows: heightAt(80) + MINIMUM_BELOW - 1, keys: QUIT })

    expect(run.stderr).toContain(ART)
    expect(run.stderr).not.toContain(RELEASED)
    expect(run.code).toBe(0)
  })

  it('holds it on a terminal with exactly enough room', async () => {
    // The row above, and the pair is the assertion: one of these two numbers
    // pins and the other does not, so `MINIMUM_BELOW` means something rather
    // than being a constant nothing reads.
    const rows = heightAt(80) + MINIMUM_BELOW
    const run = await jukebox([], { rows, keys: QUIT })

    expect(run.stderr).toContain(region(firstScrolling(80), rows))
  })

  it('holds the one-line mark the same way', async () => {
    // The narrow header is two rows where the art is six, and nothing about the
    // pin is written in terms of either -- it is counted off whatever `header`
    // returned, which is what makes this fall out rather than need a branch.
    const run = await jukebox([], { columns: NARROWEST, keys: QUIT })

    expect(run.stderr).toContain(NARROW_MARK)
    expect(run.stderr).toContain(region(firstScrolling(NARROWEST), 24))
  })
})
