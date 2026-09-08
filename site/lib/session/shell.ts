import { hero, MENU_ENTRIES, WHAT_NEXT, WORDMARK } from '../content'
import { notFound, run } from './commands'
import { header, versionLine } from './header'
import {
  blank,
  COMMENT,
  CRLF,
  decoration,
  dim,
  GUTTER,
  INDENT,
  ink,
  prose,
  row,
  written,
  type Intent,
  type Line,
  type Open,
} from './lines'
import { type Preference } from './theme'

/**
 * The verbs, as a shell hands them back -- #112.
 *
 * The page stopped reproducing a terminal and got a real one, running a real
 * bash. That migration is cheap for exactly one reason: #111's `written` turns
 * the rows the verbs already produce into bytes, so nothing above this line had
 * to change. This module is the whole of what was added -- it composes `run`
 * and `written`, and decides the two things a shell decides that a page did
 * not.
 *
 * **It is pure, and stays pure.** No DOM, no `just-bash`, no emulator. The
 * first is enforced by `tsconfig.test.json`, which compiles it with Bun's types
 * and no DOM lib; the second is enforced by nothing and is the more important
 * of the two. A shell library imported here would put its contract in the one
 * file whose value is not having one -- and #114 records that the renderer is
 * pre-1.0, which is a promise that it will change. What owns the library is the
 * wiring in `components/live.tsx`, and it is a dumb adapter on purpose.
 */

/**
 * What one entered line hands back to the shell.
 *
 * Site-shaped rather than `ExecResult`-shaped, which is the decision worth
 * naming: `stderr` and `exitCode` are `just-bash`'s vocabulary, and a module
 * that spelled them would be mirroring a contract it deliberately does not
 * import. The wiring adds them, because the wiring is what knows.
 *
 * `intents` travels here for the reason it travels on a `Printed`: writing to a
 * clipboard and moving a theme are not expressible as a pure function of state,
 * so they leave as declarations and a component performs them. That arrangement
 * is older than this file and is unchanged by a shell arriving.
 */
export type Answer = {
  readonly stdout: string
  readonly intents: readonly Intent[]
}

/**
 * The screen, and the scrollback behind it, taken away.
 *
 * Three sequences rather than one, and the middle one alone is the common
 * mistake: `2J` erases what is displayed and leaves everything that scrolled
 * off it still there, so a visitor who typed `clear` and scrolled up would find
 * the session they asked to be rid of. `3J` is what takes that away, and `H`
 * puts the cursor back at the top left, because erasing does not move it and a
 * prompt drawn at row twenty of a blank screen is a page with a hole in it.
 *
 * Ours to write rather than the shell's, which is the part worth recording:
 * `just-bash`'s bundle contains no escape sequences at all, so the `clear` it
 * ships cannot empty a terminal it does not know it is attached to. This module
 * shadows it, and this is why it has to.
 */
const ERASED = '\x1b[H\x1b[2J\x1b[3J'

/**
 * One entered line, answered as a terminal is handed it.
 *
 * **The echo is dropped, and that is the only thing here that is not a
 * forwarding.** A `Printed` carries one because the old page drew its own
 * prompt line above every answer; bash draws that line itself, at its own
 * prompt, before the command runs. Passing it through would print what somebody
 * typed twice -- once by the shell that read it and once by us.
 *
 * The trailing `CRLF` is ours to add for the reason `lines.ts` gives for not
 * adding it: `written` *joins* rows, so it leaves the cursor at the end of the
 * last one, and what follows belongs to whoever owns the stream. What follows
 * here is bash's next prompt, which wants a column of its own.
 */
/**
 * The width the mark needs, measured off the mark.
 *
 * `cli/src/header.ts` exports the same number under the same name and arrives
 * at it the same way, because both measure the banner rather than remembering
 * it -- and `cli/scripts/generate-wordmark.ts` is free to regenerate a wider one
 * without either of them being edited. Written here rather than imported
 * because `site/` does not depend on `cli/`; `content.ts` already carries the
 * art itself, generated from the same document and diffed by cli.yml.
 *
 * **Why it is a threshold at all.** The emulator derives its column count by
 * measuring a character and dividing the container width, so a grid narrower
 * than the art does not shrink it -- it wraps every row, and five wrapped rows
 * of Block Elements are noise. The CLI has the identical problem in a narrow
 * terminal and answers it the identical way.
 */
const NATURAL = Math.max(...WORDMARK.split('\n').map((line) => [...line].length))

/**
 * The two rows a person wrote, above everything the binary says.
 *
 * Lifted from `finished`, which composed them for the served page, and kept for
 * its reason: the binary's header is a blank row, a mark and a version line,
 * with no description among them -- so a page that printed only what the binary
 * prints would never say what the tool is. They are `#` comments because that
 * is where a human's voice goes in a shell, and prose because a person wrote
 * them.
 *
 * The lede is one row and wraps at the viewport rather than being broken here.
 * Hard-wrapping it would be this module choosing a column width for every
 * screen; wrapping is what a terminal does, and now there is a real one to do
 * it.
 */
const said = (): Line[] => [
  row(decoration(`${COMMENT} `), prose(hero.tagline)),
  row(decoration(`${COMMENT} `), prose(hero.lede)),
]

/**
 * The binary's five, as text a visitor can type.
 *
 * **Not a select any more, and that is the ticket's point rather than a
 * casualty of it.** #86 reproduced a prompt library's widget -- a cursor, arrow
 * keys, a struck-out abandoned value -- because the page had no shell to ask.
 * It has one now, and every entry here is a real command in it, so the way to
 * choose one is to type it. The widget was an answer to a question that stopped
 * being asked.
 *
 * Drawn as `listing` and `naming` draw their tables, from the metrics at the
 * leaf: a name column measured against the longest entry, then a gutter, then
 * the hint dim beside it. Three tables on this page, one shape.
 *
 * The labels are `ink` rather than `word`: `word` makes a span the cursor can
 * land on, and nothing in a terminal can be landed on. What replaces the
 * gesture is that the label *is* the command.
 */
const table = (entries: readonly { readonly label: string; readonly hint: string }[]): Line[] => {
  const width = Math.max(...entries.map((entry) => entry.label.length))

  return entries.map((entry) =>
    row(
      dim(INDENT),
      ink(entry.label),
      dim(' '.repeat(width - entry.label.length) + GUTTER),
      dim(entry.hint),
    ),
  )
}

const offered = (): Line[] => [row(ink(WHAT_NEXT)), ...table(MENU_ENTRIES)]

/**
 * A widget's rows, as text a visitor can type.
 *
 * **Without this, `install` on its own printed nothing at all.** A command that
 * asks a question carries its rows in `opens` rather than in `body` -- the
 * `body` is genuinely empty -- because the widget used to be live: `select.ts`
 * drew the options, moved a cursor through them and took an answer. #112
 * deleted that, and `answered` was serialising `body` alone, so the one verb
 * whose whole content lived in the other field became a dead word. It reached
 * the registry, returned cleanly, and drew the next prompt over an empty line.
 *
 * Drawn through `table` for the reason the menu is: these are the same shape,
 * so they get the same column. **What is listed is `runs` rather than `label`,
 * and that is the difference between the two callers.** A menu entry's label is
 * already the command; a picker option's label is `windows` while the thing to
 * type is `install windows`, and printing the label alone would offer a word
 * that resolves to nothing. `label` is the fallback because `runs` is optional
 * on `Option` and an entry that omits it is one whose label is the command.
 */
const opened = (open: Open): Line[] => [
  row(ink(open.message)),
  ...table(
    open.options.map((option) => ({ label: option.runs ?? option.label, hint: option.hint })),
  ),
]

/**
 * What a visitor meets, written once when the shell attaches.
 *
 * **Static text, and it has to be.** `BashShell` builds its `Bash` lazily inside
 * `attach`, so nothing is registered when the greeting is written and no
 * command could have produced any of this. That is a constraint the library
 * imposes and it happens to be the right shape anyway: a greeting is what the
 * page says before anybody has asked it anything.
 *
 * `columns` is the emulator's own count, handed over by `onReady`, and the only
 * argument here that is a fact about a browser. Below `NATURAL` the art is
 * dropped and the version line stands on its own -- the same trade
 * `cli/src/header.ts` makes in a narrow terminal, and the reason the mark is
 * not simply allowed to wrap.
 *
 * There is no second copy of the art in either branch. `header` composes the
 * wide one out of `WORDMARK`, and the narrow one prints no art at all, so the
 * generator that keeps `content.ts` in step with `DESIGN.md` -- and the diff in
 * cli.yml that checks it -- are untouched by this file existing.
 */
/**
 * What the binary prints when it is run with nothing after it.
 *
 * Split out of the greeting because a visitor types `jukebox` -- it is the one
 * word on the first screen, and the page spent four tickets teaching it. Left
 * whole, that word would have reached `run`, resolved to no command and printed
 * *command not found* for the name of the program the page is about.
 *
 * It is the greeting minus the two comments, and the split is exactly where the
 * voices divide: the tagline and the lede are the page speaking, so they belong
 * to the greeting and to nothing a command can print. ADR-0010's rule about the
 * two vocabularies survives its typographic half being retired, and this is
 * where it is now carried -- by what each voice is allowed to say.
 */
export const started = (version: string, columns: number): Line[] => [
  ...(columns >= NATURAL ? header(version) : [blank(), row(ink(versionLine(version)))]),
  blank(),
  ...offered(),
]

export const greeting = (version: string, columns: number): string =>
  written([
    ...said(),
    ...started(version, columns),

    // The gap above the prompt, as a row rather than as an accident. The
    // adapter writes `greeting + CRLF` and then draws its prompt, so this
    // function must *join* its rows and not terminate them -- exactly what
    // `written` already promises. Terminating here too would put a blank row on
    // screen that nothing in this list asked for, which is the difference
    // between spacing somebody chose and spacing that happened.
    blank(),
  ])

/**
 * What `just-bash` says when a word resolves to nothing.
 *
 * Transcribed from the shell's own message rather than imported, because it is
 * not exported and is a string in somebody else's bundle. That makes this the
 * one brittle line in the file, and it is brittle in the safe direction: if the
 * wording upstream changes, the match stops firing and the visitor sees bash's
 * sentence instead of ours. A page saying the wrong true thing, rather than a
 * page that breaks.
 *
 * The trailing break is optional and matched either way, because bash writes a
 * bare `\n` and the adapter converts it to CRLF before this ever sees it -- so
 * which one arrives is a fact about a library version rather than about a
 * shell, and pinning it would be pinning the wrong thing.
 */
const UNRESOLVED = /bash: (.+?): command not found(\r?\n)?/g

/**
 * Bash's not-found, said the way this page says it.
 *
 * **The shell still does the resolving.** Real bash has
 * `command_not_found_handle` for precisely this and `just-bash` implements no
 * such hook, so the wording is changed on the stream on its way to the
 * terminal. Nothing here decides whether a word is a command -- by the time
 * this runs, bash has already decided and failed to find one.
 *
 * A rewrite rather than a suppression: what replaces the line is `notFound`,
 * the same two rows the old page printed and the same two `commands.ts` still
 * prints for a word `help` cannot describe. So a visitor who mistypes gets one
 * sentence in one voice, whichever of the two paths reached them.
 *
 * Everything that is not that message passes through untouched, which is what
 * makes this safe to put in front of every byte the shell writes.
 */
export const reworded = (chunk: string): string =>
  chunk.replace(UNRESOLVED, (_match, word: string) => written(notFound(word)) + CRLF)

export const answered = (buffer: string, preference: Preference): Answer => {
  const printed = run(buffer, preference)
  const intents = printed.intents ?? []

  // Read off the flag rather than off the name. `run` already decides which
  // command empties a screen, and asking `buffer === 'clear'` here would be a
  // second opinion about it -- one that disagrees the moment `clear foo` is
  // typed, which `run` answers by emptying and this would answer by printing.
  if (printed.clears === true) return { stdout: ERASED, intents }

  // A command that asks a question keeps its rows in `opens`, so a serialiser
  // reading `body` alone prints nothing for it. See `opened` above.
  const body =
    printed.opens === undefined ? printed.body : [...printed.body, ...opened(printed.opens)]

  return { stdout: written(body) + CRLF, intents }
}
