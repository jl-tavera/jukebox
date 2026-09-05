import { madeSafe } from './folders'
import { joiner, type Host } from './paths'

/**
 * Where a Track's audio would be, and how it is handed to whatever plays it.
 *
 * Two halves, split where `config.ts` splits `resolved` from the read that feeds
 * it: everything that decides anything here is a pure function of values passed
 * in, and the two impure edges -- one `readdir` and one spawn -- are the
 * command's and this file's respectively, each a couple of lines with nothing to
 * get wrong.
 *
 * The split is what lets every platform's answer be checked from any platform,
 * which `paths.ts` argues for at length and which matters here for the same
 * reason it matters there: Windows is this project's primary environment and
 * Linux is CI's, so neither can be the only one that runs the code.
 *
 * ADR-0004 carries the reasoning for the search itself -- why a name is looked
 * for rather than computed, what counts as a match, and which extensions count.
 * It is an amendment to that ADR rather than a docblock here because it is a
 * decision about the Library's layout, and the Library's layout is what that
 * document is.
 */

/**
 * What Jukebox will open.
 *
 * An allowlist rather than "whatever is in the folder", because the folder is
 * the user's own: it holds cover art, a playlist file, a text file of notes, and
 * `files.ts`'s `*.pid.part` from a write that was interrupted. Opening a JPEG
 * because its name happened to hold the Track's title is a worse answer than
 * saying nothing is there -- the second is true and the first wastes a person's
 * time working out what they are looking at.
 *
 * Not a ranking. Two files that both match are settled by name below, not by
 * which extension appears first here, and nothing should start reading this
 * order as a preference without deciding to.
 */
const AUDIO = ['.flac', '.mp3', '.ogg', '.opus', '.m4a', '.wav']

/**
 * Half-written by definition, and never opened.
 *
 * `files.ts` writes through `${path}.${pid}.part` and renames, so one of these
 * is either a write in flight or one that died. It ends in neither an audio
 * extension nor anything else stable, so the check above already excludes it --
 * this is here because that is an accident of the naming scheme rather than
 * something the scheme promises, and a partial file reaching a music player is
 * the kind of thing worth two lines to refuse twice.
 */
const PARTIAL = /\.\d+\.part$/i

/**
 * The folder a Playlist's audio goes in, per ADR-0004: the root the user chose,
 * then the name the Playlist was given when its title first landed.
 *
 * `null` where the Playlist has no folder name yet, which is one that has never
 * resolved. Unreachable through `open` -- a Playlist with a numbered Track has a
 * title, and the name is computed the moment a title arrives -- and returned
 * rather than asserted, because an assertion about another module's invariant is
 * a crash where a `null` is an answer.
 *
 * `joiner(host)`, never the bare `join`. Issue #71 is this exact mistake made
 * once already, in a file that had every reason to know better, and `paths.ts`
 * exports the joiner so that it cannot be made a third time.
 */
export const folderOf = (host: Host, library: string, folderName: string | null): string | null =>
  folderName === null ? null : joiner(host)(library, folderName)

/**
 * Which of the files in a Playlist's folder is this Track, if any of them is.
 *
 * Takes the names rather than reading them, so the whole of the decision is
 * testable with no filesystem and on any platform.
 *
 * **Matched, not computed.** The obvious implementation builds `{nn} - {title}`
 * and looks for it, and it is wrong twice over: DESIGN section 11 marks that
 * template Proposed, so inheriting it by looking at it is the mistake ADR-0004
 * already refused to make with `~2`; and it would find nothing that a person put
 * in the folder themselves, which in a release that downloads nothing is every
 * file there is. Containment costs a scan of a directory somebody is about to
 * play a song out of, and it keeps working whatever Fetching settles on, as long
 * as the name holds the title.
 *
 * The title goes through `madeSafe` because the filename did. A title with a
 * slash in it cannot appear in a filename holding that slash, so comparing the
 * raw strings would fail on exactly the titles nobody thinks to test.
 *
 * **An exact stem wins.** `Rain.mp3` beats `Rain and Shine.mp3` for a Track
 * called Rain, which containment alone gets backwards -- a short title is a
 * substring of every longer one. Beyond that, first by sorted name, and
 * deliberately silently.
 *
 * That last part is a considered disagreement with `reading.ts`, which refuses
 * to resolve an ambiguous Playlist and says so. The rule there is that a wrong
 * answer to "which of these did you mean" is one the reader has no way to
 * notice, and it does not hold here: a player names what it opened, in a window
 * in front of them, a second later. Opening the wrong file wastes a click.
 * `remove` is where that rule earns its strictness, and this is not `remove`.
 */
export const fileNamed = (title: string, entries: string[]): string | null => {
  const wanted = madeSafe(title).toLowerCase()

  // A title made entirely of characters no filesystem takes. Nothing could have
  // been named after it, so nothing matches it -- and an empty needle would
  // otherwise be a substring of every file in the folder and open one at random.
  if (wanted === '') return null

  const audible = entries.filter((entry) => {
    const lowered = entry.toLowerCase()
    return !PARTIAL.test(lowered) && AUDIO.some((extension) => lowered.endsWith(extension))
  })

  const stemOf = (entry: string): string => entry.slice(0, entry.lastIndexOf('.')).toLowerCase()

  const exact = audible.filter((entry) => stemOf(entry) === wanted).sort()
  if (exact.length > 0) return exact[0]!

  const holding = audible.filter((entry) => stemOf(entry).includes(wanted)).sort()

  return holding[0] ?? null
}

/**
 * The command line that asks the operating system to open a file with whatever
 * it opens that kind of file with.
 *
 * Pure, and computed for a Host rather than for the machine it runs on, so the
 * Windows answer is checked on Linux and the other way round.
 *
 * **Windows is not the obvious one, and the obvious one is a bug.**
 * `cmd /c start "" <path>` is what almost every answer to this question says,
 * and it runs a *shell* over a string that is whatever the user's music happens
 * to be called. Bun quotes an argument vector by the Windows CRT's rules and
 * `cmd` re-parses what it receives by its own, which do not agree: a file called
 * `Bell, Book & Candle.mp3` arrives at `cmd` as two commands. That is not a
 * contrived filename, it is a Tuesday in a music folder, and the failure it
 * produces is arbitrary command execution rather than a missing file.
 *
 * `explorer.exe <path>` is the other common answer. It avoids the shell, and it
 * exits non-zero on success -- documented behaviour, and it would poison any
 * later attempt to read the child's code.
 *
 * `rundll32 url.dll,FileProtocolHandler` takes exactly one argument, is not a
 * shell, and is the handler verb itself. It reports nothing about whether the
 * handler worked, which is no loss: `start` reports nothing either, because the
 * program that opens the file is a third process in both cases.
 */
export const handedTo = (host: Host, path: string): string[] => {
  if (host.platform === 'darwin') return ['open', path]
  if (host.platform === 'win32') return ['rundll32.exe', 'url.dll,FileProtocolHandler', path]

  return ['xdg-open', path]
}

/**
 * Handing a file to the operating system, which is the one thing in this CLI
 * that reaches outside it.
 *
 * A `Seams` entry for `Patience`'s reason: it is ordinary behaviour that a test
 * must be able to replace, and there is no environment variable for it because
 * it is not a thing a user configures.
 */
export type Opener = (host: Host, path: string) => void

/**
 * The real one.
 *
 * Three decisions, none of them taste:
 *
 * `'ignore'` on all three streams. `'inherit'` would let `xdg-open`'s warnings
 * about a missing desktop file land in the middle of the JSON object on stdout,
 * which `render.ts` names as the one thing a caller parsing it cannot survive.
 * `'pipe'` is worse than either: a pipe nobody drains is a child that blocks
 * once its buffer fills.
 *
 * `unref()`, and this one is a bug without it rather than untidiness. `index.ts`
 * sets `process.exitCode` instead of calling `process.exit`, deliberately, so
 * that a write to a pipe is never cut short -- which means the process leaves
 * when the event loop empties, and a child handle nobody released keeps it from
 * emptying. The binary would print its answer and then sit there.
 *
 * Never `await child.exited`. `xdg-open` can block for as long as the player it
 * started is open, and whether that player liked the file is its own business.
 */
export const handing: Opener = (host, path) => {
  const child = Bun.spawn(handedTo(host, path), {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  })

  child.unref()
}
