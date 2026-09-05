import { defineCommand, type ArgsDef } from 'citty'
import { add } from './commands/add'
import { config } from './commands/config'
import { list } from './commands/list'
import { remove } from './commands/remove'
import { show } from './commands/show'
import { sync } from './commands/sync'
import { version } from './commands/version'
import { VERSION } from './version'

/**
 * Typed as citty's own `ArgsDef` rather than left to be inferred, which keeps
 * the root a plain `CommandDef` and so something `main` can be handed.
 *
 * citty makes a `CommandDef` invariant in its arguments -- its lifecycle hooks
 * take them as a parameter -- so an inferred one is assignable to nothing. Its
 * own `SubCommandsDef` reaches for `any` at the same wall; this does not have
 * to, because the root's arguments are read off the raw vector and nothing here
 * wants them typed.
 */
const args: ArgsDef = {
  // Declared so that it appears in the usage. `main` reads it off the raw
  // argument vector rather than from here, for the reason written on `asked`
  // there, and says what its stability is on every help rather than only on
  // this one.
  json: {
    type: 'boolean',
    description: 'Emit one JSON object instead of human text.',
  },
}

/**
 * The command tree. One level deep, and it stays that way -- `main` resolves a
 * command name against this by hand, and the rule it uses assumes it.
 *
 * Commands arrive with the tickets that can complete them. Nothing here is
 * registered before it works: a command listed in `--help` that answers "not
 * built yet" is the same mistake as a column nothing writes to.
 *
 * The rule holds and the comparison no longer does, which is worth saying here
 * rather than leaving for a reader to catch. Since #108 the Mirror carries
 * exactly one column nothing writes to -- `tracks.file_path` -- added knowingly,
 * argued in migration 3, and permitted there on grounds that do not reach a
 * command: it is NULL in every row and so can never say anything untrue, whereas
 * a registered command that does not work answers a person who ran it. Every
 * command in this tree still works the day it is listed.
 */
export const root = defineCommand({
  meta: {
    name: 'jukebox',
    version: VERSION,
    description: 'Mirror public playlists and keep a local record of what is in them.',
  },
  args,
  subCommands: { add, config, list, remove, show, sync, version },
})
