import { exports } from 'cloudflare:workers'

/**
 * The worker's own entry point, which every test here drives rather than
 * importing a route module: the routing, the JSON body handling and the
 * response headers are then under test rather than assumed.
 */

export const createPlaylist = (url: unknown) =>
  exports.default.fetch('https://api.jukebox.dev/playlists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })

export const tracksOf = (id: string) =>
  exports.default.fetch(`https://api.jukebox.dev/playlists/${id}/tracks`)
