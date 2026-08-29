import { describe, expect, it } from 'vitest'
import { normalize } from './normalize'
import type { ItemsPage } from './payloads'
import missingIsrc from './__fixtures__/missing-isrc.json'
import mixedEntries from './__fixtures__/mixed-entries.json'
import multiPage0 from './__fixtures__/multi-page-offset-0.json'
import multiPage50 from './__fixtures__/multi-page-offset-50.json'
import onePage from './__fixtures__/one-page.json'
import severalArtists from './__fixtures__/several-artists.json'

/**
 * `normalize` called directly, against the responses `__fixtures__/MANIFEST.md`
 * captured from the live Source. It is pure and synchronous by design, and it
 * is where the combinatorial cases live -- entries that are not Tracks, a
 * missing ISRC, several artists, cover image sizes. Driving each of those
 * through the whole pipeline would report a normalize defect as an HTTP
 * assertion three layers from its cause.
 *
 * The expected Tracks are written out rather than derived from the fixture:
 * an assertion that reads the payload the way the code does agrees with it by
 * construction and can never disagree.
 */

describe('a playlist that fits one page', () => {
  it('normalizes into Tracks the contract describes', () => {
    expect(normalize([onePage])).toEqual({
      skipped: 0,
      tracks: [
        {
          sourceTrackId: '4rzfv0JLZfVhOhbSQ8o5jZ',
          title: 'Api',
          artists: ['Odiseo'],
          album: 'Progressive Psy Trance Picks Vol.8',
          durationMs: 376_000,
          isrc: 'DEKC41200989',
          position: 0,
          coverImageUrl: 'https://i.scdn.co/image/ab67616d0000b273ce6d0eef0c1ce77e5f95bbbc',
        },
        {
          sourceTrackId: '5o3jMYOSbaVz3tkgwhELSV',
          title: 'Is',
          artists: ['Vlasta Marek'],
          album: 'Wellness & Dreaming Source',
          durationMs: 730_066,
          isrc: 'FR2X41475057',
          position: 1,
          coverImageUrl: 'https://i.scdn.co/image/ab67616d0000b273aa2ff29970d9a63a49dfaeb2',
        },
        {
          sourceTrackId: '4Cy0NHJ8Gh0xMdwyM9RkQm',
          title: 'All I Want',
          artists: ['LCD Soundsystem'],
          album: 'This Is Happening',
          durationMs: 401_440,
          isrc: 'US4GE1000022',
          position: 2,
          coverImageUrl: 'https://i.scdn.co/image/ab67616d0000b273ee0d0dce888c6c8a70db6e8b',
        },
        {
          sourceTrackId: '6hvFrZNocdt2FcKGCSY5NI',
          title: 'Endpoints',
          // Two artists on one entry, which is what this donor was chosen for.
          artists: ['Glenn Horiuchi', 'Glenn Horiuchi Trio'],
          album:
            'Glenn Horiuchi Trio / Gelenn Horiuchi Quartet: Mercy / Jump Start / Endpoints / ' +
            'Curl Out / Earthworks / Mind Probe / Null Set / Another Space (A)',
          durationMs: 358_760,
          isrc: 'USB8U1025969',
          position: 3,
          coverImageUrl: 'https://i.scdn.co/image/ab67616d0000b2738b7447ac3daa1da18811cf7b',
        },
        {
          sourceTrackId: '2E2znCPaS8anQe21GLxcvJ',
          title: 'You Are So Beautiful',
          artists: ['Zucchero'],
          album: 'All The Best (Spanish Version)',
          durationMs: 176_093,
          isrc: 'ITUM70701043',
          position: 4,
          coverImageUrl: 'https://i.scdn.co/image/ab67616d0000b27304e57d181ff062f8339d6c71',
        },
      ],
    })
  })
})

/**
 * `mixed-entries.json` is composed rather than captured whole -- no single
 * public playlist holds an episode, a local file and a null entry together --
 * but every entry in it is a real, unmodified capture. MANIFEST.md says so in
 * the file itself.
 */
describe('entries the Source offered that are not Tracks', () => {
  it('leaves out a podcast episode, a local file and an unavailable entry', () => {
    const { tracks } = normalize([mixedEntries])

    expect(tracks.map((track) => track.sourceTrackId)).toEqual([
      '33QRau26GpW2wI24c4Qsj5',
      '1KrpXYLMCJ8GaDSz61FQNU',
      '59V7DzfcDkxuSlWEG634jm',
    ])
  })

  it('counts them, so a shorter list than the Source shows is not data loss', () => {
    expect(normalize([mixedEntries]).skipped).toBe(3)
  })

  it('keeps the Source index, so what was skipped leaves a visible gap', () => {
    const { tracks } = normalize([mixedEntries])

    // Six entries in, three Tracks out, at the indexes they came from rather
    // than renumbered 0, 1, 2.
    expect(tracks.map((track) => track.position)).toEqual([0, 2, 5])
  })
})

describe('the artists of a Track', () => {
  it('is an array whether there are three, two or one', () => {
    const { tracks } = normalize([severalArtists])
    const at = (position: number) => tracks.find((track) => track.position === position)

    // Three on one entry is what this donor was chosen for. One artist is the
    // ordinary case, and it is an array of one rather than a bare string --
    // nothing downstream should have to tell the two apart.
    expect(at(19)?.artists).toEqual(['Monster High', 'KATSEYE', 'Mattel'])
    expect(at(29)?.artists).toEqual(['KATSEYE'])
  })

  it('leaves out the local file this donor also happens to hold', () => {
    const { tracks, skipped } = normalize([severalArtists])

    // 40 entries, one of them a local file at index 16.
    expect(tracks).toHaveLength(39)
    expect(skipped).toBe(1)
    expect(tracks.some((track) => track.position === 16)).toBe(false)
  })
})

describe('the cover image of a Track', () => {
  it('is the largest size the Source offers', () => {
    // Constructed rather than captured, because no capture can tell this
    // apart: Spotify happens to order its images widest first in all ten
    // fixtures, so taking the first and taking the largest agree on every one
    // of them. The criterion is the largest, so that is what is asserted, on
    // an input that can tell the difference.
    const page: ItemsPage = {
      items: [
        {
          is_local: false,
          item: {
            id: 'smallest-first',
            name: 'Smallest First',
            type: 'track',
            duration_ms: 1000,
            artists: [{ name: 'Someone' }],
            album: {
              name: 'An Album',
              images: [
                { url: 'https://example.test/64.jpg', width: 64 },
                { url: 'https://example.test/640.jpg', width: 640 },
                { url: 'https://example.test/300.jpg', width: 300 },
              ],
            },
          },
        },
      ],
    }

    expect(normalize([page]).tracks[0]?.coverImageUrl).toBe('https://example.test/640.jpg')
  })

  it('is the 1280 one where the Source offers a size above its usual 640', () => {
    // MANIFEST.md describes album images as 640/300/64, and one entry across
    // every fixture is not: this one offers 1280. Pinned so that "largest"
    // cannot quietly become "the 640 one".
    const { tracks } = normalize([severalArtists])

    expect(tracks.find((track) => track.position === 29)?.coverImageUrl).toBe(
      'https://i.scdn.co/image/ab6742d3000053b79fd6084bb1c8b4191205c4e8',
    )
  })
})

describe('a Track the Source holds no ISRC for', () => {
  it('carries null rather than going missing', () => {
    // `missing-isrc.json` is derived, not captured: no real catalog track
    // lacking an ISRC was found across 91 public playlists, so one had to be
    // constructed to reach this branch as a real track rather than as the
    // local file that naturally exhibits it. MANIFEST.md finding 3.
    const { tracks } = normalize([missingIsrc])

    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.isrc).toBeNull()
  })
})

describe('what a Track does not carry', () => {
  it('leaves the Source its own vocabulary', () => {
    const [track] = normalize([onePage]).tracks

    // `popularity`, `preview_url` and `available_markets` are in the captured
    // input on purpose, so that this assertion has something to be about.
    // Storing them would invite their use, and they are Spotify's words for
    // Spotify's concerns, not the domain's.
    expect(Object.keys(track!).sort()).toEqual([
      'album',
      'artists',
      'coverImageUrl',
      'durationMs',
      'isrc',
      'position',
      'sourceTrackId',
      'title',
    ])
  })
})

/**
 * `normalize` takes the pages rather than one page, and this is what holds it
 * to that. It is not the paging walk -- nothing here fetches, and `fetch` still
 * reads a single page. It is the reason #12 can add the walk by changing how
 * pages are gathered without touching what they mean.
 */
describe('a playlist the Source answered in more than one page', () => {
  it('reads as one list, in the order the pages were read', () => {
    const { tracks, skipped } = normalize([multiPage0, multiPage50])

    // 50 entries then 19, none of them skipped. Position runs unbroken across
    // the join, so nothing restarts at 0 when the second page begins.
    expect(tracks).toHaveLength(69)
    expect(skipped).toBe(0)
    expect(tracks.map((track) => track.position)).toEqual([...Array(69).keys()])
  })

  it('carries the first Track of the second page at its own index', () => {
    const { tracks } = normalize([multiPage0, multiPage50])

    expect(tracks[50]).toMatchObject({
      sourceTrackId: '1FG7ZjnuT0O9CsDKOxND0E',
      position: 50,
    })
  })
})

describe('a Track whose entry carries no album', () => {
  it('has a null album and no cover to go with it', () => {
    // Constructed, like the cover ordering above and for the same reason: every
    // track in every captured response carries an album, so nothing captured
    // reaches this branch. The normalized shape allows null, DESIGN names an
    // absent album as a case, so it is driven rather than left to inference.
    //
    // It is also the only thing that reaches `coverImageUrl: null` for a real
    // catalog track -- MANIFEST.md finding 6 records why no capture does.
    const page: ItemsPage = {
      items: [
        {
          is_local: false,
          item: {
            id: 'no-album',
            name: 'Loose Recording',
            type: 'track',
            duration_ms: 1000,
            artists: [{ name: 'Someone' }],
            album: null,
          },
        },
      ],
    }

    expect(normalize([page]).tracks[0]).toMatchObject({
      album: null,
      coverImageUrl: null,
    })
  })
})
