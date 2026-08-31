import type {
  DiscoveryDocument,
  ErrorCode,
  PlaylistId,
  PlaylistStatus,
  PlaylistTracks,
  Track,
} from '@jukebox/schema'

/**
 * The outside world, as far as the CLI can tell: a real HTTP server on a port
 * the operating system chose, serving real documents over a real socket.
 *
 * A server rather than a replaced global `fetch`, which spec #29 asks for by
 * name. What is worth protecting is what the CLI does with what comes back off
 * the wire -- a 404 carrying an error page, a body that is not JSON, a
 * connection refused -- and a fake that decides for itself what those mean
 * agrees just as happily with a client that never made a request.
 *
 * It serves both surfaces, because they are two Workers to deploy and one
 * address to a test: the discovery document the site publishes, and the two
 * routes the API answers. A document served with `api` naming this same server
 * is what sends the CLI back here for its Playlists, which is what
 * `servingItsOwnApi` is for.
 *
 * The answers are shaped by `@jukebox/schema` throughout, so a contract change
 * breaks this file's typecheck rather than being discovered as a CLI that agrees
 * with a fixture nobody regenerated.
 *
 * It lives beside the harness rather than inside it because the harness is the
 * driver for `main` and this is the outside world. `cli.test.ts`, `mode.test.ts`
 * and `paths.test.ts` need not know it exists.
 *
 * The port is ephemeral so two suites, or a suite and the site's dev server,
 * can never collide over one.
 */

/**
 * An error the API answers with, in the envelope every one of its failures uses.
 *
 * `refuse` is the discriminator as well as the status, because the alternative
 * -- asking whether a `version` field is present -- would quietly reclassify a
 * snapshot the day the contract grows a field with that name.
 */
export type Refusal = { refuse: number; code: ErrorCode; message: string }

export const refusing = (refuse: number, code: ErrorCode, message: string): Refusal => ({
  refuse,
  code,
  message,
})

/**
 * An answer the contract does not describe: a status with no error envelope
 * under it.
 *
 * What something in front of the API produces rather than anything the worker
 * writes -- an edge answering 502, a rate limiter, a block page served as HTML.
 * Worth a shape of its own because the CLI cannot read one, and what it does
 * when it cannot is the difference between one Playlist failing and a whole
 * Sync failing.
 */
export type Broken = { breaks: number; body: string }

export const breaking = (breaks: number, body: string): Broken => ({ breaks, body })

/** What `POST /playlists` says about one URL. */
export type Tracked = { id: PlaylistId; status: PlaylistStatus } | Refusal

/**
 * What `GET /playlists/{id}/tracks` says. `'resolving'` is the 202 a Playlist
 * with no Tracks yet gets -- deliberately not an empty snapshot, which a client
 * could not tell from a Playlist that resolved to nothing.
 *
 * Named for what this server answers rather than for what the CLI makes of it:
 * `api.ts` has a `Held` of its own, and the two are different halves of one wire.
 */
export type Answer = PlaylistTracks | 'resolving' | Refusal | Broken

/**
 * One running server, and everything a test needs to steer it.
 *
 * Answers are replaced rather than the server restarted, so the port never
 * moves -- which matters, because the caching tests point several runs at one
 * address and a moved port would read as a different site.
 */
export type Site = {
  /** Where the document is served, including the path. What a run is pointed at. */
  url: string
  /** The bare address, for a discovery document's `api` to name. */
  origin: string
  /**
   * What every later request for the document gets. An object is serialised; a
   * string is served exactly as written, which is how a body that is not a
   * document is served at all.
   */
  serves: (body: unknown, status?: number) => void
  /** What `POST /playlists` answers for this URL. Any other URL is refused. */
  tracking: (url: string, answer: Tracked) => void
  /**
   * What `GET /playlists/{id}/tracks` answers, in order, the last one repeating
   * for ever.
   *
   * A sequence rather than a value a test replaces mid-run, because the thing
   * worth saying is "resolving, resolving, then here they are" and saying it
   * with a timer would be a test racing the code it is testing.
   */
  holding: (id: PlaylistId, ...answers: Answer[]) => void
  /** How many times the discovery document has been asked for. */
  readonly requests: number
  /** Every request that arrived, in order. What proves a poll polled. */
  readonly asked: ReadonlyArray<{ method: string; path: string }>
  /** Forgets both records, so a later assertion counts from a known point. */
  forgets: () => void
  /**
   * Stops listening. Every later request is refused, which is what no network
   * looks like from inside the CLI.
   */
  stop: () => Promise<void>
}

const running: Site[] = []

/** Every site started so far, stopped. Called from an afterAll, like `removeHomes`. */
export const stopServing = async () => {
  while (running.length > 0) await running.pop()!.stop()
}

/** A well-formed document, for a test to vary one field of. */
export const healthy = (fields: Partial<DiscoveryDocument> = {}): DiscoveryDocument => ({
  api: 'https://api.example.test',
  min_version: '0.0.1',
  status: 'ok',
  message: null,
  ...fields,
})

/** A Track as the contract describes one, for a test to vary a field of. */
export const track = (fields: Partial<Track> = {}): Track => ({
  sourceTrackId: 'blue-dot',
  title: 'Blue Dot',
  artists: ['Aria Fenn'],
  album: 'Ninety Miles',
  durationMs: 214_000,
  isrc: 'GBSTU0100001',
  position: 0,
  coverImageUrl: 'https://stub.jukebox.dev/art/ninety-miles.jpg',
  ...fields,
})

/** A Playlist's Tracks at one Version, for a test to vary a field of. */
export const snapshot = (fields: Partial<PlaylistTracks> = {}): PlaylistTracks => ({
  version: 1,
  title: 'The Fixed Set',
  skipped: 0,
  tracks: [track()],
  ...fields,
})

/**
 * Stand-ins for the worker's own copy, deliberately not copies of it.
 *
 * What is worth protecting is that whatever the server says arrives unchanged --
 * and a fixture holding the worker's exact sentences could not tell that apart
 * from a CLI that had the sentences built in. These are shorter than the real
 * ones on purpose, so a test asserting one came through verbatim is asserting
 * passthrough rather than agreeing with a string it also owns.
 *
 * The worker's real copy is asserted where it is written, in its own tests.
 */
export const REFUSALS = {
  invalidUrl: refusing(
    400,
    'invalid_url',
    'That does not look like a playlist Jukebox can track.',
  ),
  notFound: refusing(404, 'playlist_not_found', 'Jukebox is not tracking that playlist.'),
  gone: refusing(410, 'playlist_gone', 'That playlist cannot be read, and trying again will not help.'),
  unavailable: refusing(
    503,
    'source_unavailable',
    'Jukebox could not read that playlist just now.',
  ),
} as const

/**
 * Is the caller already holding this Version?
 *
 * Deliberately the worker's own rule from `worker/src/index.ts`, restated rather
 * than simplified down to what the CLI happens to send. RFC 9110 lets
 * `If-None-Match` carry a list, lets a tag be marked weak, and gives `*` the
 * meaning "whatever you have now" -- and a test server that accepted a bare `1`
 * would pass a CLI that the real worker answers a whole snapshot to.
 *
 * This is the half of the seam spec #29 asks for by name: the server decides
 * what a conditional request means, so a CLI that never sent one cannot agree
 * with it.
 */
const holdsVersion = (header: string | undefined, version: number): boolean =>
  (header ?? '').split(',').some((tag) => {
    const sent = tag.trim().replace(/^W\//, '')
    return sent === '*' || sent === `"${version}"`
  })

const envelope = (refusal: Refusal): Response =>
  Response.json({ error: { code: refusal.code, message: refusal.message } }, {
    status: refusal.refuse,
  })

/**
 * Starts a server serving the document given, on a port nothing else holds.
 *
 * Registered for teardown on the way out, the way `temporaryHome` registers a
 * directory, so a test says what it wants and one `afterAll` cleans up after
 * every test in the file.
 */
export const serving = (document: DiscoveryDocument = healthy()): Site => {
  let answer: () => Response = () => Response.json(document)
  let requests = 0

  const asked: { method: string; path: string }[] = []
  const tracked = new Map<string, Tracked>()
  const held = new Map<PlaylistId, Answer[]>()

  const tracks = (id: PlaylistId, holding: string | undefined): Response => {
    const queued = held.get(id)
    if (queued === undefined || queued.length === 0) return envelope(REFUSALS.notFound)

    // Shifted while more than one remains, so the last answer given is the one
    // every later request gets. That is what lets a test say "resolving twice,
    // then resolved" and also "resolving for ever".
    //
    // Above the conditional check below, and not by accident: a revalidation is
    // a request like any other and consumes a queued answer like any other. A
    // test saying "changed, then unchanged" is describing two asks.
    const next = queued.length > 1 ? queued.shift()! : queued[0]!

    if (next === 'resolving') return Response.json({ status: 'pending' }, { status: 202 })
    if ('refuse' in next) return envelope(next)

    // Served as it arrived, with no envelope under it, because the point of it
    // is that it is not the contract's shape.
    if ('breaks' in next) {
      return new Response(next.body, {
        status: next.breaks,
        headers: { 'content-type': 'text/html' },
      })
    }

    // The ETag and Cache-Control the contract requires, on the answer with a
    // body and on the empty one that revalidates it -- the same tag either way,
    // so a client that stores whatever came back stores the same thing.
    const headers = { etag: `"${next.version}"`, 'cache-control': 'no-cache' }

    // The whole of a sync that has nothing to do. `Response.json` cannot express
    // it: a 304 carries no body at all, which is the one answer this API gives
    // that `api.ts` cannot parse a document out of.
    if (holdsVersion(holding, next.version)) return new Response(null, { status: 304, headers })

    return Response.json(next, { headers })
  }

  const created = async (request: Request): Promise<Response> => {
    const body = (await request.json().catch(() => ({}))) as { url?: unknown }
    const url = typeof body.url === 'string' ? body.url : ''

    const answered = tracked.get(url)

    // No adapter claims this URL, which is the one case the real worker answers
    // for a URL it was told nothing about.
    if (answered === undefined) return envelope(REFUSALS.invalidUrl)

    if ('refuse' in answered) return envelope(answered)

    // 202 for a Playlist with no Tracks yet, 200 for one already resolved --
    // the two statuses the contract gives this route on success.
    return Response.json(answered, { status: answered.status === 'ok' ? 200 : 202 })
  }

  const server = Bun.serve({
    // 0 is "whichever port is free". Bun's own default is 3000, so leaving this
    // out would make two suites fight over one port.
    port: 0,
    // Named rather than left to the wildcard address, because `server.url` is
    // built from it and `http://0.0.0.0:PORT` is not an address every platform
    // will connect back to.
    hostname: '127.0.0.1',
    fetch: async (request) => {
      // Decoded, because a Playlist id carries the colon ADR-0001 joins it with
      // and a client is free to send that percent-encoded. Both spellings reach
      // the same Playlist through the real worker, so both must here.
      const path = decodeURIComponent(new URL(request.url).pathname)
      asked.push({ method: request.method, path })

      if (path === '/discovery.json') {
        requests += 1
        return answer()
      }

      if (path === '/playlists' && request.method === 'POST') return await created(request)

      const forTracks = /^\/playlists\/(.+)\/tracks$/.exec(path)
      if (forTracks !== null && request.method === 'GET') {
        return tracks(forTracks[1]!, request.headers.get('if-none-match') ?? undefined)
      }

      return new Response('Not found\n', { status: 404 })
    },
  })

  // A site a test forgot to stop cannot hold `bun test` open.
  server.unref()

  const site: Site = {
    url: new URL('/discovery.json', server.url).href,
    origin: new URL(server.url).origin,
    serves: (body, status = 200) => {
      answer =
        typeof body === 'string'
          ? () => new Response(body, { status, headers: { 'content-type': 'text/html' } })
          : () =>
              new Response(JSON.stringify(body), {
                status,
                headers: { 'content-type': 'application/json' },
              })
    },
    tracking: (url, answered) => void tracked.set(url, answered),
    holding: (id, ...answers) => void held.set(id, [...answers]),
    get requests() {
      return requests
    },
    get asked() {
      return asked
    },
    forgets: () => {
      requests = 0
      asked.length = 0
    },
    stop: () => server.stop(true),
  }

  running.push(site)
  return site
}

/**
 * A site whose discovery document sends the CLI back to the site's own API
 * routes, which is what every test of a command that reaches the backend wants.
 *
 * The document cannot be built before the server is, because the address it has
 * to name is the one the operating system is about to choose.
 */
export const servingItsOwnApi = (fields: Partial<DiscoveryDocument> = {}): Site => {
  const site = serving()
  site.serves(healthy({ ...fields, api: site.origin }))
  return site
}
