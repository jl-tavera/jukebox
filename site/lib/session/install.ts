import { INSTALL_COMMANDS, platforms, type InstallCommand, type System } from '../content'
import {
  COMMENT,
  copy,
  decoration,
  dim,
  GUTTER,
  ink,
  prose,
  row,
  word,
  type Intent,
  type Line,
  type Open,
} from './lines'

/**
 * The install command, as three systems and two lines.
 *
 * `SITE.md` 01 gives the page two jobs in priority order and this is the first
 * of them: *hand over the install command*. On the hero that was true by
 * construction -- the command sat in static markup at a fixed place with
 * nothing to run first -- and ADR-0010 traded that guarantee away when the page
 * became a terminal. What replaces it is here: a guess at the visitor's system,
 * that system's line on screen at boot with a control that copies it, and a
 * picker over all three for when the guess is wrong.
 *
 * **Nothing in this file touches a browser**, `guessed` below included. It is
 * handed a user agent as a string and `components/live.tsx` is what reads one
 * off `navigator` -- the arrangement `boot.ts` already has with
 * `REDUCED_MOTION`, and what keeps the detection answerable under `bun test`.
 *
 * **No binary download appears here or anywhere else.** The install script does
 * architecture detection and checksum verification that a browser cannot, so
 * the command is the artifact and a download would be a worse one.
 */

/** The page's own verb for all of this. `commands.ts` registers it under this name. */
export const INSTALL = 'install'

/** What the picker asks. */
export const WHICH_SYSTEM = 'Which system?'

/**
 * The three, in the order `INSTALL_COMMANDS` lists their commands.
 *
 * Derived rather than written, so a system cannot be offered by the picker and
 * left out of the label that says who a command is for. The order that falls
 * out is the POSIX line's systems and then Windows, which is `README.md`'s.
 */
export const SYSTEMS: readonly System[] = INSTALL_COMMANDS.flatMap((command) => command.systems)

/**
 * Whether a word names one of them.
 *
 * What makes `install macos` an argument rather than a mistake. Written as a
 * comparison rather than a cast: this workspace has no type assertion in it
 * outside a `catch (cause: unknown)` narrowing, and a predicate is the honest
 * way to narrow a string a visitor typed.
 */
export const isSystem = (word: string): word is System =>
  SYSTEMS.some((system) => system === word)

/**
 * The line that installs on one system.
 *
 * **Three systems answer with two commands**, because the curl line installs on
 * macOS and on Linux. That is the asymmetry `InstallCommand.systems` exists to
 * carry, and it is why choosing `macos` and choosing `linux` print the same
 * string: the question a person can answer is which of these they are, not
 * which of two shells they have.
 */
export const commandFor = (system: System): InstallCommand =>
  INSTALL_COMMANDS.find((command) => command.systems.includes(system))!

/**
 * What reaches the clipboard, and what a screen reader is told reached it.
 *
 * The **whole** command, which is the point: the row it is drawn on carries a
 * shell sigil in front of it and a control after it, and neither belongs in a
 * terminal. `SITE.md` 06 states this for a donation address -- *verify by
 * capturing the argument to `clipboard.writeText`, not by eye* -- and #91 asks
 * the same of this one.
 */
export const copying = (system: System): Intent => ({
  kind: 'copy',
  value: commandFor(system).command,
  what: 'the install command',
})

/**
 * The offer: who the line is for, and the line.
 *
 * Two rows, drawn once and printed in both places the command appears -- the
 * boot, where nobody asked for it, and the answer to `install <system>`. What
 * the page hands over unprompted and what it hands over when asked cannot
 * differ, because there is one function.
 *
 * The label is `dim` and the command is `ink`, which is the whole of the
 * hierarchy: there is one text size on this page, so the thing to paste is the
 * thing at full contrast. The sigil is the command's own -- `$` for the POSIX
 * line and `>` for PowerShell -- because a `$` in front of a PowerShell line is
 * a small untruth on a page whose job is handing over something to paste.
 *
 * The gutter is `dim` rather than `decoration`, for the reason `commands.ts`
 * gives about its own columns: decoration is hidden from assistive technology,
 * and a hidden run of spaces would run the command and the control together
 * into one word.
 */
export const offering = (system: System): Line[] => {
  const command = commandFor(system)

  return [
    row(decoration(`${COMMENT} `), dim(platforms(command))),
    row(
      decoration(`${command.prompt} `),
      ink(command.command),
      dim(GUTTER),
      copy(copying(system)),
    ),
  ]
}

/**
 * Where the other two are.
 *
 * Printed under the boot's offer and nowhere else. A visitor the guess got
 * wrong is looking at a command that is not theirs, and `help` would tell them
 * about `install` if they thought to ask -- this is the row that means they do
 * not have to. It is what keeps a wrong guess costing one command rather than
 * the visit.
 */
export const elsewhere = (): Line =>
  row(
    decoration(`${COMMENT} `),
    prose('Run '),
    decoration('`'),
    word(INSTALL),
    decoration('`'),
    prose(' to choose another system.'),
  )

/**
 * Every row the picker offers, and what choosing one enters.
 *
 * The rows read `macos`, `linux` and `windows` because that is what a visitor
 * is choosing between; what each one *runs* is a line they could have typed, so
 * a chosen row and a typed one go through the same path and cannot drift apart.
 * `select.ts`'s `named` matches the label, so typing `windows` at the open
 * picker answers it too.
 *
 * **There is no way out among them, and that is not an oversight.** The menu
 * carries `quit` because the binary's menu does. This select is the page's own,
 * and `terminal.ts` already leaves one behind on any word that does not name a
 * row -- so a fourth row offering to do that would be a row for something that
 * works without it.
 */
export const PICKER: Open = {
  message: WHICH_SYSTEM,
  options: SYSTEMS.map((system) => ({
    label: system,
    hint: commandFor(system).hint,
    runs: `${INSTALL} ${system}`,
  })),
  cursor: 0,
}

/**
 * Which system a user agent is probably running.
 *
 * Read off the one string every browser has had since before any of this, and
 * deliberately not `navigator.userAgentData`: that is Chromium-only, its
 * platform arrives behind a promise, and what it would buy over this is
 * precision about a question whose wrong answers are already cheap. Only
 * *Windows or not* changes which command is drawn, so a Chromebook read as
 * `linux` and an iPad read as `macos` are both handed the curl line, which is
 * the line they would have chosen.
 *
 * Windows is asked first because a Windows agent names no other system, and
 * `X11` and `CrOS` sit with Linux because the shell that runs there is the one
 * the curl line wants.
 *
 * `undefined` rather than a fallback. The caller keeps whatever the page was
 * served with, so a guess that fails costs nothing and this file never quietly
 * chooses on a visitor's behalf.
 */
export const guessed = (agent: string): System | undefined => {
  if (/Windows/i.test(agent)) return 'windows'
  if (/Macintosh|Mac OS/i.test(agent)) return 'macos'
  if (/Linux|X11|CrOS/i.test(agent)) return 'linux'

  return undefined
}
