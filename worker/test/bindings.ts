/**
 * Bindings that stand in for the real ones.
 *
 * A binding is a boundary the worker crosses, the same way global `fetch` is,
 * so it is where a test can watch or interrupt one without a seam being opened
 * inside the worker to allow it. Nothing in `src/` knows any of this happened,
 * which is the property that makes it worth doing this way.
 *
 * Each is a `Proxy` that changes one member and forwards the rest. Forwarding
 * has to re-bind: a KV or D1 method pulled off its object loses `this` and
 * throws, so `member.bind(target)` is load-bearing rather than tidy.
 */

/** Forwards everything except `property`, which `instead` answers. */
const allBut = <T extends object>(
  target: T,
  property: string,
  instead: (target: T) => unknown,
): T =>
  new Proxy(target, {
    get: (object, asked) => {
      if (asked === property) return instead(object as T)

      const member = Reflect.get(object, asked)
      return typeof member === 'function' ? member.bind(object) : member
    },
  })

/**
 * A binding that records which of its methods were called, and changes no
 * answer.
 *
 * Method names, never arguments. What these tests ask is how much work an
 * answer costs; which keys it touched is `snapshots.ts`'s business, and an
 * assertion naming one would pin a spelling nothing outside that module is
 * supposed to know.
 */
export const counting = <T extends object>(binding: T, asked: string[]): T =>
  new Proxy(binding, {
    get: (target, property) => {
      const member = Reflect.get(target, property)
      if (typeof member !== 'function') return member

      return (...args: unknown[]) => {
        asked.push(String(property))
        return member.apply(target, args)
      }
    },
  })

/**
 * A cache that answers and will not store.
 *
 * Stops a Resolution after its D1 writes and before anything is servable, which
 * is the state a redelivery finds when it has no Version to compare itself
 * against.
 */
export const refusingToStore = (cache: KVNamespace): KVNamespace =>
  allBut(cache, 'put', () => () => Promise.reject(new Error('the cache stopped accepting writes')))

/**
 * A statement that will answer a question and change nothing.
 *
 * `bind` is proxied too, or the refusal would be dropped by the call that
 * supplies the values.
 */
const refusingToRun = (statement: D1PreparedStatement): D1PreparedStatement =>
  new Proxy(statement, {
    get: (target, property) => {
      if (property === 'bind') {
        return (...values: unknown[]) => refusingToRun(target.bind(...values))
      }

      if (property === 'run') {
        return () => Promise.reject(new Error('the database stopped accepting updates'))
      }

      const member = Reflect.get(target, property)
      return typeof member === 'function' ? member.bind(target) : member
    },
  })

/**
 * A database that answers reads and writes Tracks, and cannot move a Playlist
 * row.
 *
 * A Resolution records its Tracks in a batch and moves the row on its own, so
 * this stands one up exactly where a redelivery gets interesting: the Tracks
 * are stored, the snapshot is written, head names it -- and the row still holds
 * the Version from before.
 */
export const refusingUpdates = (db: D1Database): D1Database =>
  allBut(db, 'prepare', (target) => (sql: string) => refusingToRun(target.prepare(sql)))

/**
 * A cache that answers its `ordinal`th read as a miss, and every other read
 * truthfully.
 *
 * Counted rather than keyed, and the two exports below are the two counts a
 * read of Tracks can lose something at. Which keys exist and what they are
 * called is `snapshots.ts`'s business, so a stand-in that spelled one here
 * would pin what that module owns -- and the order the reads happen in is
 * fixed by something a test may legitimately hold on to: DESIGN section 05
 * makes head first and alone the cheap path.
 */
const missingTheRead = (cache: KVNamespace, ordinal: number): KVNamespace => {
  let reads = 0

  return allBut(cache, 'get', (target) => {
    // Through `Reflect.get` because `get` is overloaded five ways, and this
    // forwards whichever one the caller meant without naming any of them.
    const real = Reflect.get(target, 'get') as (...args: unknown[]) => Promise<unknown>

    return (...args: unknown[]) => {
      reads += 1
      if (reads === ordinal) return Promise.resolve(null)

      return real.apply(target, args)
    }
  })
}

/**
 * A cache that has lost head.
 *
 * The state a client polling for Tracks puts a real KV into. A miss is
 * negatively cached for up to a minute in the colo that made it, so a poll sent
 * before a Resolution finishes leaves the absence of head cached behind it -- and
 * the next poll goes on reading `null` from a key that now exists. Miniflare's
 * KV is strongly consistent and has no such window, so nothing in this suite
 * meets it without being stood in for.
 *
 * Head is the first read, so this is the first read missing.
 */
export const missingTheFirstRead = (cache: KVNamespace): KVNamespace =>
  missingTheRead(cache, 1)

/**
 * A cache that answers head and has lost the snapshot it names.
 *
 * The failure DESIGN section 09 answers with "fall back to D1 + rebuild
 * snapshot", and the one this suite could not reach before: an immutable key
 * that was written, named by a head that is still right about it, and gone.
 * Nothing in the worker's own writes produces it -- which is exactly why it
 * has to be stood up rather than waited for.
 *
 * The snapshot is the second read, after head. A conditional request never
 * makes it, which is the point of the cheap path and worth a test of its own.
 */
export const missingTheSecondRead = (cache: KVNamespace): KVNamespace =>
  missingTheRead(cache, 2)
