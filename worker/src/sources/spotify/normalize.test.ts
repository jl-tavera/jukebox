import { describe, expect, it } from 'vitest'
import { normalize } from './normalize'
import type { ItemsPage, PlaylistMetadata } from './payloads'
import missingIsrc from './__fixtures__/missing-isrc.json'
import mixedEntries from './__fixtures__/mixed-entries.json'
import multiPage0 from './__fixtures__/multi-page-offset-0.json'
import multiPage50 from './__fixtures__/multi-page-offset-50.json'
import onePage from './__fixtures__/one-page.json'
import playlistMetadata from './__fixtures__/playlist-metadata.json'
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

/**
 * `normalize` driven as a Resolution drives it: the captured playlist object
 * standing behind the pages.
 *
 * Every suite but the last two is about the Tracks rather than about what the
 * Playlist is called, so the metadata is supplied once here rather than at each
 * call. It is the real capture, so those suites are driven by the same input the
 * pipeline produces.
 */
const normalizedFrom = (...pages: readonly ItemsPage[]) =>
  normalize({ metadata: playlistMetadata, pages })

describe('a playlist that fits one page', () => {
  it('normalizes into Tracks the contract describes', () => {
    expect(normalizedFrom(onePage)).toEqual({
      title: 'Spotify Web API Testing playlist',
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
    const { tracks } = normalizedFrom(mixedEntries)

    expect(tracks.map((track) => track.sourceTrackId)).toEqual([
      '33QRau26GpW2wI24c4Qsj5',
      '1KrpXYLMCJ8GaDSz61FQNU',
      '59V7DzfcDkxuSlWEG634jm',
    ])
  })

  it('counts them, so a shorter list than the Source shows is not data loss', () => {
    expect(normalizedFrom(mixedEntries).skipped).toBe(3)
  })

  it('keeps the Source index, so what was skipped leaves a visible gap', () => {
    const { tracks } = normalizedFrom(mixedEntries)

    // Six entries in, three Tracks out, at the indexes they came from rather
    // than renumbered 0, 1, 2.
    expect(tracks.map((track) => track.position)).toEqual([0, 2, 5])
  })
})

describe('the artists of a Track', () => {
  it('is an array whether there are three, two or one', () => {
    const { tracks } = normalizedFrom(severalArtists)
    const at = (position: number) => tracks.find((track) => track.position === position)

    // Three on one entry is what this donor was chosen for. One artist is the
    // ordinary case, and it is an array of one rather than a bare string --
    // nothing downstream should have to tell the two apart.
    expect(at(19)?.artists).toEqual(['Monster High', 'KATSEYE', 'Mattel'])
    expect(at(29)?.artists).toEqual(['KATSEYE'])
  })

  it('leaves out the local file this donor also happens to hold', () => {
    const { tracks, skipped } = normalizedFrom(severalArtists)

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

    expect(normalizedFrom(page).tracks[0]?.coverImageUrl).toBe('https://example.test/640.jpg')
  })

  it('is the 1280 one where the Source offers a size above its usual 640', () => {
    // MANIFEST.md describes album images as 640/300/64, and one entry across
    // every fixture is not: this one offers 1280. Pinned so that "largest"
    // cannot quietly become "the 640 one".
    const { tracks } = normalizedFrom(severalArtists)

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
    const { tracks } = normalizedFrom(missingIsrc)

    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.isrc).toBeNull()
  })
})

describe('what a Track does not carry', () => {
  it('leaves the Source its own vocabulary', () => {
    const [track] = normalizedFrom(onePage).tracks

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
 * to that. It is not the paging walk -- nothing here fetches. It is the reason
 * the walk could be added by changing only how pages are gathered: what a page
 * means was already settled here, and this file did not move when it landed.
 */
describe('a playlist the Source answered in more than one page', () => {
  it('reads as one list, in the order the pages were read', () => {
    const { tracks, skipped } = normalizedFrom(multiPage0, multiPage50)

    // 50 entries then 19, none of them skipped. Position runs unbroken across
    // the join, so nothing restarts at 0 when the second page begins.
    expect(tracks).toHaveLength(69)
    expect(skipped).toBe(0)
    expect(tracks.map((track) => track.position)).toEqual([...Array(69).keys()])
  })

  it('carries the first Track of the second page at its own index', () => {
    const { tracks } = normalizedFrom(multiPage0, multiPage50)

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

    expect(normalizedFrom(page).tracks[0]).toMatchObject({
      album: null,
      coverImageUrl: null,
    })
  })
})

/**
 * The Playlist's own name -- the one thing `normalize` reads from outside the
 * pages. The awkward cases are here for the reason the header gives: they are
 * combinatorial, and a placeholder that leaked into a title would otherwise be
 * reported as an HTTP assertion three layers from the branch that made it.
 */
describe('the title of a Playlist', () => {
  it('is trimmed, so a name that merely looks padded is not stored padded', () => {
    // ADR-0004 has the client derive a Library folder name from this, and a
    // trailing space is a filesystem hazard on the platform DESIGN section 06
    // names as the primary one. Trimming is not inventing a name; padding one
    // back out would be.
    const padded: PlaylistMetadata = { name: '  Wellness & Dreaming Source  ' }

    expect(normalize({ metadata: padded, pages: [onePage] }).title).toBe(
      'Wellness & Dreaming Source',
    )
  })
})

describe('a Playlist its Source offers no usable name for', () => {
  // Four ways of offering nothing. The whitespace one is what an implementation
  // is likeliest to let through -- '   ' is a truthy string, so `name ?? null`
  // passes it on and only trimming refuses it.
  it.each([
    ['no name at all', {}],
    ['a name the Source sent as null', { name: null }],
    ['an empty name', { name: '' }],
    ['a name of nothing but whitespace', { name: '   ' }],
  ])('carries no title rather than an invented one, given %s', (_, metadata: PlaylistMetadata) => {
    // Never a placeholder, and never the id or the address dressed as one:
    // either would reach whoever saw it looking like the name its owner chose,
    // and nothing downstream could tell the invention from the fact.
    expect(normalize({ metadata, pages: [onePage] }).title).toBeNull()
  })

  it('still normalizes into its Tracks', () => {
    // A name is not what a Playlist is for. A Source that will not say what one
    // is called has still said what is in it, and the entries are untouched by
    // the absence -- which is the whole of "still resolves and is served".
    const { tracks, skipped } = normalize({ metadata: {}, pages: [onePage] })

    expect(tracks).toHaveLength(5)
    expect(skipped).toBe(0)
  })
})
