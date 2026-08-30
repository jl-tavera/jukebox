import type { DiscoveryDocument } from '@jukebox/schema'

/**
 * The site, as far as the CLI can tell: a real HTTP server on a port the
 * operating system chose, serving a real document over a real socket.
 *
 * A server rather than a replaced global `fetch`, which spec #29 asks for by
 * name. What is worth protecting is what the CLI does with what comes back off
 * the wire -- a 404 carrying an error page, a body that is not JSON, a
 * connection refused -- and a fake that decides for itself what those mean
 * agrees just as happily with a client that never made a request. At #36 the
 * same server grows the API's routes and the argument is made again and harder,
 * by the conditional request.
 *
 * It lives beside the harness rather than inside it because the harness is the
 * driver for `main` and this is the outside world. `cli.test.ts`, `mode.test.ts`
 * and `paths.test.ts` need not know it exists.
 *
 * The port is ephemeral so two suites, or a suite and the site's dev server,
 * can never collide over one.
 */

/**
 * One running site, and everything a test needs to steer it.
 *
 * The document is replaced rather than the server restarted, so the port never
 * moves -- which matters, because the caching tests point several runs at one
 * address and a moved port would read as a different site.
 */
export type Site = {
  /** Where the document is served, including the path. What a run is pointed at. */
  url: string
  /**
   * What every later request gets. An object is serialised; a string is served
   * exactly as written, which is how a body that is not a document is served at
   * all.
   */
  serves: (body: unknown, status?: number) => void
  /** How many times the document has been asked for. */
  readonly requests: number
  /** Forgets the count, so a later assertion counts from a known point. */
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

/**
 * Starts a site serving the document given, on a port nothing else holds.
 *
 * Registered for teardown on the way out, the way `temporaryHome` registers a
 * directory, so a test says what it wants and one `afterAll` cleans up after
 * every test in the file.
 */
export const serving = (document: DiscoveryDocument = healthy()): Site => {
  let answer: () => Response = () => Response.json(document)
  let requests = 0

  const server = Bun.serve({
    // 0 is "whichever port is free". Bun's own default is 3000, so leaving this
    // out would make two suites fight over one port.
    port: 0,
    // Named rather than left to the wildcard address, because `server.url` is
    // built from it and `http://0.0.0.0:PORT` is not an address every platform
    // will connect back to.
    hostname: '127.0.0.1',
    fetch: (request) => {
      if (new URL(request.url).pathname !== '/discovery.json') {
        return new Response('Not found\n', { status: 404 })
      }

      requests += 1
      return answer()
    },
  })

  // A site a test forgot to stop cannot hold `bun test` open.
  server.unref()

  const site: Site = {
    url: new URL('/discovery.json', server.url).href,
    serves: (body, status = 200) => {
      answer =
        typeof body === 'string'
          ? () => new Response(body, { status, headers: { 'content-type': 'text/html' } })
          : () => new Response(JSON.stringify(body), {
              status,
              headers: { 'content-type': 'application/json' },
            })
    },
    get requests() {
      return requests
    },
    forgets: () => void (requests = 0),
    stop: () => server.stop(true),
  }

  running.push(site)
  return site
}
