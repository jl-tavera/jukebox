/**
 * The one failure a Source distinguishes for itself.
 *
 * Thrown by a Source's `fetch` when that Source will not serve this Playlist
 * and trying again will not help -- `CONTEXT.md`'s Gone. Every other failure is
 * believed temporary, so this is the narrow case and a plain throw is the wide
 * one: a Source that says nothing about a failure gets it retried, which is the
 * safe direction to be wrong in.
 *
 * It has a module to itself rather than a place in `registry.ts` for a reason
 * that only bites later. `registry.ts` imports each adapter and each adapter
 * imports `registry.ts` back, which is a cycle TypeScript erases today because
 * every one of those back-imports is `import type`. A class is a value, so
 * putting it there would make the cycle real, and the first adapter to mention
 * it anywhere but inside a function body would fail at start-up. Nothing about
 * the DESIGN section 03 boundary changes: this is not an adapter, and the only
 * things that touch it are the adapter that throws it and Resolution, which
 * catches it.
 */
export class PlaylistGone extends Error {}
