import type { PlaylistId } from '@jukebox/schema'

/**
 * The name of a Playlist's folder in the Library, per ADR-0004.
 *
 * Nothing here touches a filesystem, and nothing here creates anything. ADR-0004
 * is explicit that the decision reaches the code as a string and nothing else
 * until Fetching exists: the name is computed once, stored in the Mirror, and
 * never recomputed -- because renaming a directory of the user's files in
 * response to a remote change is exactly what the rule against destroying local
 * files exists to prevent.
 *
 * Computed for every platform on every platform, not for the one it is running
 * on. A Mirror is a file someone can copy between machines, and a name that was
 * legal where it was made and is not legal where it is used would be a folder
 * nothing can create with no way left to find out why.
 */

/**
 * The characters Windows refuses in a path segment, plus the control range no
 * filesystem will take.
 *
 * Dropped rather than replaced, which is the decision ADR-0004 left open. A
 * title arrives as prose, and prose with a slash in it reads as two words with a
 * mark between them; `_` in each one's place would be a name nobody wrote and
 * nobody searching for the Playlist would type.
 *
 * The whitespace control characters are not in here. They are whitespace first
 * and control characters second, so they go through the collapse below and
 * become a space rather than vanishing and welding two words into one.
 */
const FORBIDDEN = /[<>:"/\\|?*\x00-\x08\x0e-\x1f]/g

/**
 * Names MS-DOS gave to devices and Windows still will not give to a file, with
 * or without an extension after them -- `CON.txt` is as refused as `CON`.
 *
 * Suffixed rather than dropped or replaced by the id, so that someone whose
 * Playlist really is called CON can still find the folder it made.
 */
const DEVICES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/**
 * Long enough that almost no title is cut, short enough that the path this is
 * one segment of stays inside what every platform will take.
 *
 * 100 rather than the 255 a segment is allowed, because ADR-0004 puts a track
 * file inside this folder inside a Library root the user chose, and it is the
 * whole path that has a limit -- one this segment has to leave room in.
 *
 * A suffix is added after the cut, so a device name or a collision can carry the
 * result a few characters past this. Both are bounded and both are far inside
 * what a segment holds; shortening the name to make room would change the thing
 * the suffix exists to distinguish.
 */
const LONGEST = 100

/**
 * The folder name a Playlist would take if nothing else held it.
 *
 * The id is the fallback rather than an invented placeholder, and it is the same
 * fallback the CLI displays a Playlist by: `CONTEXT.md` says a title is absent
 * where the Source offers nothing usable, "never a placeholder, which nobody
 * downstream could tell from a real title". Its colon goes, because ADR-0001
 * joins a Source and its id with the one forbidden character every id is
 * guaranteed to contain.
 */
export const sanitized = (title: string | null, id: PlaylistId): string => {
  const stripped = (title ?? '')
    .replace(FORBIDDEN, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Repeated, because Windows strips trailing dots and spaces when it creates a
  // directory and a single pass over `Focus. . .` leaves one of each behind. A
  // name the Mirror and the disk disagree about is one a later Fetch would look
  // up and not find.
  const trimmed = stripped.replace(/[. ]+$/, '')

  if (trimmed === '') return id.replace(':', '-')

  const short = shortened(trimmed)

  // After the cut, not before it. A reserved *stem* is four characters, which is
  // what an earlier version of this reasoned from -- but a reserved *name* is any
  // length, because the reservation covers an extension too, so `CON.` followed by
  // two hundred characters is a device name and escaped the cut entirely.
  //
  // Cutting first also catches the case checking first could not: a cut that
  // happens to end on `CON`.
  return DEVICES.test(short) ? `${short} (device)` : short
}

/**
 * Cut at a word where there is one, so the result reads as an abbreviation
 * rather than as corruption. A single word longer than the limit has no word to
 * cut at and is cut where the limit falls, which is the honest answer rather
 * than a name kept over-long because it was awkward to shorten.
 */
const shortened = (name: string): string => {
  if (name.length <= LONGEST) return name

  const cut = name.slice(0, LONGEST)
  const lastSpace = cut.lastIndexOf(' ')

  return (lastSpace === -1 ? cut : cut.slice(0, lastSpace)).replace(/[. ]+$/, '')
}

/**
 * The same name, or the first numbered variation of it nothing else holds.
 *
 * ADR-0004 says two Playlists whose titles sanitize to the same string get a
 * numeric suffix, and this is the whole of that. ` (2)` rather than `~2` because
 * it is what Windows itself does with a duplicate, and because `~2` is DESIGN
 * section 11's sketch for a colliding *track filename* -- a different decision,
 * still marked Proposed, and not one to inherit by looking at it.
 *
 * The first name is never the one that moves. A suffix landing on the Playlist
 * that got there first would be the rename ADR-0004 forbids.
 *
 * The loop ends because `taken` is a finite set of folder names already in the
 * Mirror, so some number above it is free.
 */
export const unclaimed = (name: string, taken: (candidate: string) => boolean): string => {
  if (!taken(name)) return name

  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`
    if (!taken(candidate)) return candidate
  }
}

/**
 * What a Playlist's folder is called: its title made safe, and made unique
 * against the names already spoken for.
 *
 * A suffix can carry the result a few characters past `LONGEST`. That is
 * deliberate -- shortening the name to make room would change the thing the
 * suffix exists to distinguish -- and a handful over 100 is still far inside
 * what a path segment holds.
 */
export const folderFor = (
  title: string | null,
  id: PlaylistId,
  taken: (candidate: string) => boolean,
): string => unclaimed(sanitized(title, id), taken)
