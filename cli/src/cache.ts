import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiscoveryDocument } from '@jukebox/schema'
import { readDiscovery } from './discovery'
import { locations } from './paths'

/**
 * The last discovery document seen, kept on disk so that a run with no network
 * has something to fall back on.
 *
 * A file, and not the Mirror. `DESIGN.md` section 07 step 1 says "read cached
 * discovery from local SQLite", written when the Mirror was assumed to exist by
 * now; it does not, and #35 is where it comes into existence "because it is the
 * first thing that needs one". A database created solely to hold one object of
 * a couple of hundred bytes would be a schema shipped ahead of its first real
 * use, which is the mistake the worker's own migrations set the rule against.
 * Moving this into the Mirror later is one function and no migration, because
 * the file is discardable by construction.
 *
 * It lives in the data directory rather than beside the configuration, because
 * configuration is "written by a person and worth keeping" and this is written
 * by a machine and worth nothing the moment it is refetched.
 */

/**
 * How long the saved copy is preferred to a fresh read.
 *
 * Two forces pulling opposite ways. The site serves this document with
 * `Cache-Control: no-cache` precisely because a kill switch behind an unknown
 * delay is a kill switch of unknown value, which argues for zero. And a `sync`
 * that spends a round trip on a static file every time it runs argues for a
 * day. An hour bounds how long an outage message or a raised minimum takes to
 * reach everybody still running, while making a person's `add`, then `sync`,
 * then `sync` cost one fetch between them.
 *
 * `DESIGN.md` leaves refresh intervals blank on purpose -- "a plausible-looking
 * invented constant is worse than a blank, because it gets copied" -- so this
 * is a decision taken here rather than a number read from there, and section 07
 * records it.
 */
export const FRESH_FOR_MS = 60 * 60 * 1000

/** The saved copy's name inside the data directory. Named by a test, so exported. */
export const CACHE_FILE = 'discovery.json'

/**
 * The last document seen, and the two things that decide whether it may be used
 * again.
 *
 * The document is nested rather than spread beside the other two fields,
 * because it is the site's shape and not ours: a field the site adds later must
 * not be able to collide with a field this wrapper owns. Snake case throughout,
 * so a person who opens the file is not asked to notice which half is which.
 */
export type Seen = {
  /**
   * Which address it came from.
   *
   * A copy fetched from a site served on an ephemeral port is not a copy of the
   * real one, and a developer who pointed at a local site once should not spend
   * the next hour talking to a port that has closed.
   */
  source: string
  /**
   * Epoch milliseconds.
   *
   * Written down rather than read off the file's modification time, for two
   * reasons. It survives a home being copied or restored, which an mtime does
   * not. And it is what lets a test age a document by editing one number, which
   * is why no clock is injected anywhere in this ticket.
   */
  fetched_at: number
  document: DiscoveryDocument
}

const cacheFile = (): string => join(locations().data, CACHE_FILE)

/**
 * The saved copy for this address, or nothing.
 *
 * Absent, unreadable, unparseable, saved by a run pointed somewhere else, or
 * carrying something the reader will not take: all one answer, and a silent
 * one. The file is ours, it is rebuildable, and there is nothing a person could
 * do about it that fetching again does not already do. A warning here would be
 * noise on a run that is about to work.
 *
 * It being silent does not make it invisible. A corrupt copy is not a fallback
 * either, so a run that also cannot reach the site stops with
 * `network_unreachable` -- which is correct, because there genuinely is nothing.
 */
export const lastSeen = (source: string): Seen | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(cacheFile(), 'utf8'))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined

  const seen = parsed as Record<string, unknown>
  if (seen['source'] !== source) return undefined
  const fetchedAt = seen['fetched_at']
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return undefined

  // Read rather than trusted, so a hand-edited file cannot get a document in
  // through a door the network could not.
  const document = readDiscovery(seen['document'])
  if (document === undefined) return undefined

  return { source, fetched_at: fetchedAt, document }
}

/**
 * Whether the saved copy may still be used without asking the site.
 *
 * An age outside the window either way is not fresh, and the lower bound is not
 * pedantry: a copy written while the clock was wrong forward sits in the future
 * permanently once the clock is corrected, and would otherwise never expire.
 */
export const isFresh = (seen: Seen, now: number = Date.now()): boolean => {
  const age = now - seen.fetched_at
  return age >= 0 && age < FRESH_FOR_MS
}

/**
 * Saves a document for the next run.
 *
 * **Every failure here is swallowed, and that is the whole point of the
 * function.** The document has already been fetched and this run is already
 * going to work; this writes it for the *next* one. A read-only home, a full
 * disk, and a rename Windows refuses because another process holds the file are
 * all reasons for the next run to fetch again, and none of them is a reason for
 * this one to fail. A cache that can break a working command is worse than no
 * cache at all.
 *
 * Written to a temporary name in the same directory and renamed onto the
 * target, which is `DESIGN.md` section 06's own discipline for the same reason:
 * a reader either sees the old file or the new one, never half of either. The
 * same directory because that is where a rename is atomic. The process id is in
 * the temporary name so two runs at once cannot interleave into one file --
 * last writer wins, and both wrote a whole document.
 */
export const remember = (source: string, document: DiscoveryDocument): void => {
  const seen: Seen = { source, fetched_at: Date.now(), document }
  const target = cacheFile()
  const part = `${target}.${process.pid}.part`

  try {
    mkdirSync(locations().data, { recursive: true })
    writeFileSync(part, JSON.stringify(seen, null, 2) + '\n')
    renameSync(part, target)
  } catch {
    // Deliberately nothing. See above.
  }
}
