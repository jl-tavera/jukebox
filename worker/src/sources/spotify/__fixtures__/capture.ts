/**
 * Re-cuts the fixtures in this directory.
 *
 * Spotify shipped breaking Web API changes twice in 2026, so re-capturing is
 * recurring work rather than a one-off. Run from the repo root:
 *
 *   bun run worker/src/sources/spotify/__fixtures__/capture.ts
 *
 * It lives inside the adapter directory because it is soaked in Spotify
 * vocabulary -- snapshot_id, market, uri, available_markets -- which DESIGN §03
 * confines to worker/src/sources/spotify/.
 *
 * Bun auto-loads the repo-root .env, so SPOTIFY_CLIENT_ID and
 * SPOTIFY_CLIENT_SECRET are picked up without any extra flag. No credential and
 * no live token is ever written to disk.
 *
 * Provenance, trim rules and findings live in MANIFEST.md. Keep the two in step.
 */

const OUT = new URL('./', import.meta.url)

const ACCOUNTS = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

/**
 * `market` is deliberately absent from every request: DESIGN §05 caches one
 * answer globally for all callers, and a market-scoped response would make that
 * cache market-specific.
 *
 * `additional_types=track,episode` is present because without it Spotify
 * returns a podcast episode wearing a track's clothes -- `type` stays
 * `"episode"`, but it gains `album`, `artists`, `external_ids`, `is_local`,
 * `popularity` and `track_number`, and loses `show`, `images` and `languages`.
 * Nothing disappears; the shape is what changes. See finding 5 in MANIFEST.md.
 */
const QUERY = 'limit=50&additional_types=track,episode'

/** Donor playlists, each verified to exhibit the shape it is captured for. */
const DONORS = {
  /** Spotify's own documentation example. 5 entries, one with two artists. */
  onePage: '3cEYpjA9oz9GiPac4AsH4n',
  /** 69 entries, so the paging walk is two requests: 50 then 19. */
  multiPage: '03Xz4NcdaWjZq2T6sKNLui',
  /** 32 entries: 22 local files and 2 null entries. */
  localAndNull: '6M6POvx8hfKqsM1G8z1Pz5',
  /** 15 entries, every one a podcast episode. */
  episodes: '2JxNo3xcSFEXUdU7CrKgYn',
  /** 40 entries, reaching three artists on one of them. */
  severalArtists: '7JQrxQmrwXvOnCdx7LNs07',
  /** Today's Top Hits. Spotify-curated, so closed to third-party apps. */
  curated: '37i9dQZF1DXcBWIGoYBM5M',
  /** Well-formed base62 that names no playlist: the deleted-or-private case. */
  absent: '1AAAAAAAAAAAAAAAAAAAAA',
} as const

// --- the trim -------------------------------------------------------------
//
// An allowlist rather than a blocklist, so a field Spotify adds later cannot
// silently bloat the next re-capture. `popularity`, `preview_url` and a
// two-entry `available_markets` are kept on purpose: spec #5 declines to carry
// them into the domain, and #11 asserts that they are dropped, which it can
// only do if they are present in the input.

type Json = Record<string, any>

const pick = (o: Json | null | undefined, keys: readonly string[]): Json =>
  o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) : {}

const markets = (o: Json) => (o.available_markets ?? []).slice(0, 2)

const artist = (a: Json) => pick(a, ['id', 'name', 'type', 'uri'])

const album = (a: Json | null) =>
  a && {
    ...pick(a, [
      'id',
      'name',
      'uri',
      'album_type',
      'release_date',
      'release_date_precision',
      'total_tracks',
    ]),
    // All three sizes (640/300/64) are kept: selecting the largest is under test.
    images: a.images,
    available_markets: markets(a),
  }

/** A playlist entry holds either a track or a podcast episode. */
const media = (t: Json | null) => {
  if (!t) return t
  if (t.type === 'episode') {
    return {
      ...pick(t, [
        'id',
        'name',
        'type',
        'uri',
        'duration_ms',
        'explicit',
        'release_date',
        'is_externally_hosted',
        'languages',
      ]),
      images: t.images,
      show: pick(t.show, ['id', 'name', 'type', 'uri']),
      available_markets: markets(t),
    }
  }
  return {
    ...pick(t, [
      'id',
      'name',
      'type',
      'uri',
      'duration_ms',
      'explicit',
      'track_number',
      'disc_number',
      'is_local',
      'popularity',
      'preview_url',
      'external_ids',
    ]),
    artists: (t.artists ?? []).map(artist),
    album: album(t.album ?? null),
    available_markets: markets(t),
  }
}

/**
 * Every entry arrives carrying both an `item` and a `track` key holding the
 * same object. We read `item` -- the key the deprecation is moving towards --
 * and drop the duplicate rather than doubling the size of every fixture.
 */
const entry = (e: Json) => ({
  ...pick(e, ['added_at', 'is_local']),
  item: media(e.item ?? e.track ?? null),
})

const PAGING = ['href', 'limit', 'next', 'offset', 'previous', 'total'] as const

const envelope = (d: Json) => ({ ...pick(d, PAGING), items: (d.items ?? []).map(entry) })

/**
 * A paging envelope around entries no single request returned. `note` says what
 * was constructed and from where, because presenting either of these as a
 * straight capture would be a claim the next reader has no way to check.
 */
const constructed = (kind: '_composed' | '_derived', note: string, items: Json[]) => ({
  [kind]: note,
  href: API + '/playlists/' + DONORS.localAndNull + '/items?offset=0&' + QUERY,
  limit: 50,
  next: null,
  offset: 0,
  previous: null,
  total: items.length,
  items,
})

// --- fetching -------------------------------------------------------------

const token = async () => {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error(
      'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set. Bun loads the repo-root .env automatically; run this from the repo root.',
    )
  }
  const res = await fetch(ACCOUNTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('token request failed: ' + res.status + ' ' + (await res.text()))
  return (await res.json()) as { access_token: string; token_type: string; expires_in: number }
}

/**
 * Reads the body as text first, so a 429 or an HTML 502 reports its status
 * rather than an opaque SyntaxError from the JSON parser.
 */
const get = async (label: string, path: string, bearer: string, wantStatus: number) => {
  const res = await fetch(API + path, { headers: { Authorization: 'Bearer ' + bearer } })
  const text = await res.text()
  if (res.status !== wantStatus) {
    throw new Error(
      label + ': expected ' + wantStatus + ', got ' + res.status + ' -- ' + text.slice(0, 200),
    )
  }
  try {
    return JSON.parse(text) as Json
  } catch {
    throw new Error(label + ': ' + res.status + ' body was not JSON -- ' + text.slice(0, 200))
  }
}

const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error('donor drifted: ' + message)
}

const write = async (name: string, value: unknown) => {
  const path = new URL(name, OUT)
  await Bun.write(path, JSON.stringify(value, null, 2) + '\n')
  console.log('  ' + name.padEnd(28) + (Bun.file(path).size / 1024).toFixed(1).padStart(6) + ' KB')
}

// --- main -----------------------------------------------------------------

const main = async () => {
  console.log('Capturing Spotify fixtures (' + new Date().toISOString().slice(0, 10) + ')\n')

  const auth = await token()
  console.log('token acquired, expires_in ' + auth.expires_in + 's\n')

  // The token response shape matters for stubbing; the token itself must not
  // reach disk. Allowlisted, so a field Spotify adds later cannot ride along.
  await write('token.json', {
    ...pick(auth, ['token_type', 'expires_in']),
    access_token: 'FIXTURE-NOT-A-REAL-TOKEN',
  })

  const bearer = auth.access_token

  // Playlist metadata carries title and owner, which NormalizedPlaylist needs,
  // and snapshot_id, which revision() generalises over.
  const meta = await get('playlist metadata', '/playlists/' + DONORS.onePage, bearer, 200)
  check(typeof meta.name === 'string', 'metadata has no name')
  check(!!meta.owner?.id, 'metadata has no owner.id')
  check(typeof meta.snapshot_id === 'string', 'metadata has no snapshot_id')
  await write(
    'playlist-metadata.json',
    pick(meta, [
      'id',
      'name',
      'description',
      'owner',
      'public',
      'collaborative',
      'snapshot_id',
      'uri',
      'images',
    ]),
  )

  // A playlist that fits one page.
  const one = await get('one-page', '/playlists/' + DONORS.onePage + '/items?' + QUERY, bearer, 200)
  check(one.next === null, 'one-page donor no longer fits a single page')
  check(one.items.length === one.total, 'one-page items do not account for total')
  await write('one-page.json', envelope(one))

  // A playlist spanning several pages, captured as the two requests a
  // sequential walk actually makes.
  const p1 = await get('page 1', '/playlists/' + DONORS.multiPage + '/items?' + QUERY, bearer, 200)
  check(!!p1.next, 'multi-page donor no longer spans more than one page')
  check(p1.items.length === p1.limit, 'page 1 is not a full page')
  check(p1.previous === null && p1.offset === 0, 'page 1 is not the first page')
  await write('multi-page-offset-0.json', envelope(p1))

  const p2 = await get(
    'page 2',
    '/playlists/' + DONORS.multiPage + '/items?' + QUERY + '&offset=50',
    bearer,
    200,
  )
  check(p2.next === null, 'multi-page donor now runs past two pages')
  check(!!p2.previous && p2.offset === 50, 'page 2 is not the second page')
  check(p1.items.length + p2.items.length === p1.total, 'the two pages do not sum to total')
  await write('multi-page-offset-50.json', envelope(p2))

  // Spotify drops additional_types=episode from its own paging links, so a walk
  // that follows `next` verbatim changes payload shape after page 1. Asserted
  // here so the day it stops being true is the day this fails. See finding 5.
  check(
    !String(p1.next).includes('track,episode'),
    'Spotify now preserves additional_types in its paging links -- finding 5 is stale',
  )

  // An entry with several artists.
  const many = await get(
    'several-artists',
    '/playlists/' + DONORS.severalArtists + '/items?' + QUERY,
    bearer,
    200,
  )
  const trimmedMany = envelope(many)
  const mostArtists = Math.max(...trimmedMany.items.map((i: Json) => i.item?.artists?.length ?? 0))
  check(mostArtists >= 3, 'several-artists donor tops out at ' + mostArtists + ' artist(s)')
  check(
    trimmedMany.items.every((i: Json) => !i.item || i.item.type !== 'track' || Array.isArray(i.item.artists)),
    'a track entry has a non-array artists field',
  )
  await write('several-artists.json', trimmedMany)

  // The three non-track entry kinds. No public playlist holds all three, so
  // real entries from two donors are spliced into one envelope.
  const ln = await get(
    'local/null donor',
    '/playlists/' + DONORS.localAndNull + '/items?' + QUERY,
    bearer,
    200,
  )
  const eps = await get(
    'episode donor',
    '/playlists/' + DONORS.episodes + '/items?' + QUERY,
    bearer,
    200,
  )

  const lnItems: Json[] = envelope(ln).items
  const epItems: Json[] = envelope(eps).items
  const isLocal = (i: Json) => i.is_local === true
  const isNull = (i: Json) => i.item === null
  const isTrack = (i: Json) => i.item?.type === 'track' && !isLocal(i)
  const isEpisode = (i: Json) => i.item?.type === 'episode'

  const take = (items: Json[], p: (i: Json) => boolean, n: number, what: string) => {
    const found = items.filter(p).slice(0, n)
    check(found.length === n, 'donor yielded ' + found.length + ' ' + what + ', wanted ' + n)
    return found
  }

  const realTracks = take(lnItems, isTrack, 3, 'real tracks')
  const localFile = take(lnItems, isLocal, 1, 'local files')[0]
  const nullEntry = take(lnItems, isNull, 1, 'null entries')[0]
  const episode = take(epItems, isEpisode, 1, 'episodes')[0]

  check(localFile.item?.id === null, 'local file no longer has a null id')
  check(String(localFile.item?.uri).startsWith('spotify:local:'), 'local file uri changed shape')
  check(!episode.item?.album && !!episode.item?.show, 'episode no longer carries show without album')

  // Ordered so the surviving tracks sit at indexes 0, 2 and 5: the gaps are the
  // point, since position preserves Spotify's original index.
  await write(
    'mixed-entries.json',
    constructed(
      '_composed',
      'Composed. No single public playlist holds an episode, a local file and a null entry together. ' +
        'Every entry below is a real, unmodified capture: the tracks, the local file and the null entry from playlist ' +
        DONORS.localAndNull +
        ', the episode from ' +
        DONORS.episodes +
        '. Only their co-location is constructed.',
      [realTracks[0], episode, realTracks[1], localFile, nullEntry, realTracks[2]],
    ),
  )

  // An ISRC-less entry. The naturally occurring case is the local file above,
  // which carries `external_ids: {}` -- but local files are skipped before
  // normalize sees them, so the isrc:null branch needs a real track to reach it.
  // No real catalog track lacking an ISRC exists to capture (finding 3), so this
  // one is constructed.
  const donorTrack: Json = structuredClone(realTracks[0])
  check(!!donorTrack.item.external_ids?.isrc, 'donor track had no ISRC to remove')
  donorTrack.item.external_ids = {}
  await write(
    'missing-isrc.json',
    constructed(
      '_derived',
      'Derived. external_ids was emptied on a real entry from playlist ' +
        DONORS.localAndNull +
        '. Unlike a local file it keeps is_local:false, a non-null id and its album images, so it reaches ' +
        'the isrc:null branch as a real catalog track would. No such track was found across 91 public playlists (finding 3).',
      [donorTrack],
    ),
  )

  // A Spotify-curated playlist is closed to third-party apps without extended
  // quota mode. It answers 404, not 403.
  const curated = await get(
    'curated playlist',
    '/playlists/' + DONORS.curated + '/items?' + QUERY,
    bearer,
    404,
  )
  await write('curated-404.json', curated)

  // A well-formed id naming no playlist -- the deleted-or-private case. Spec #5
  // claims Spotify does not distinguish it from the curated one; this is the
  // evidence, and the assertion keeps the claim honest.
  const absent = await get(
    'absent playlist',
    '/playlists/' + DONORS.absent + '/items?' + QUERY,
    bearer,
    404,
  )
  check(
    JSON.stringify(absent) === JSON.stringify(curated),
    'curated and absent playlists now answer differently -- they can be told apart',
  )
  await write('gone-404.json', absent)

  console.log('\nDone. Update MANIFEST.md if any donor, trim rule or finding changed.')
}

await main()
