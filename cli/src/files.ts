import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Putting bytes somewhere, whole or not at all.
 *
 * `paths.ts` owns where everything goes and is pure by design -- a `Host` handed
 * in, nothing read. The one thing it cannot own is the act of writing, and that
 * act now has two callers with opposite ideas about failure. This is the impure
 * half of the same concern, and it takes no side: it throws, and each caller
 * decides what that means.
 *
 * Not `writing.ts`, which would sit beside `reading.ts` and read as the Mirror's
 * writer. That is `tracking.ts`.
 */

/**
 * The name a half-written file goes under.
 *
 * The process id is in it so two runs at once cannot interleave into one file --
 * last writer wins, and both wrote a whole one. Named by a test, so exported.
 */
export const partOf = (path: string): string => `${path}.${process.pid}.part`

/**
 * Writes the file, and throws if it could not.
 *
 * Written to a temporary name in the same directory and renamed onto the target,
 * which is `DESIGN.md` section 06's own discipline: a reader sees the old file or
 * the new one and never half of either. The same directory, because that is where
 * a rename is atomic.
 *
 * The part file is removed on the way out, so a rename the operating system
 * refused does not leave litter next to the target that nothing will ever clean
 * up. That removal is itself wrapped, because a cleanup that threw would replace
 * the real error with a worse one -- the caller needs to know why the write
 * failed, not why the tidying did.
 *
 * **What this does not promise.** The guarantee is that a reader sees one whole
 * file or the other, which the rename gives. It is not that the write survives a
 * power cut, which would need the file and its directory both fsynced. Nothing
 * here is worth that: a discovery document is refetched within the hour, and a
 * configuration file the user just wrote is one they can write again.
 */
export const replaceFile = (path: string, text: string): void => {
  const part = partOf(path)
  mkdirSync(dirname(path), { recursive: true })

  try {
    writeFileSync(part, text)
    renameSync(part, path)
  } catch (error) {
    try {
      rmSync(part, { force: true })
    } catch {
      // Deliberately nothing. See above.
    }

    throw error
  }
}
