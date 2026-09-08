import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MENU_ENTRIES } from '../lib/content'
import { enter, open, screenText } from './harness'

/**
 * What the shell can read -- #113.
 *
 * **The one question this file exists for is whether the bytes are the same
 * ones.** The ticket's criterion is that reading an installer in the page shows
 * *the same bytes the site serves*, and that is not answerable at any other
 * seam. `test/machine.test.ts` holds the invented half to the glossary and
 * knows nothing about a build; `scripts/check-installers.ts` reads the export
 * and knows nothing about the page. Only here are both in the room: the Worker
 * is serving `out/` through `wrangler dev`, and the shell beside it is holding
 * whatever `lib/published.ts` read at build time. If those ever stop being the
 * same file, this is the only thing that notices.
 *
 * **Digests rather than text, and that is not fastidiousness.** A terminal
 * wraps: at 375 the grid is 44 columns, so a hex string longer than that
 * arrives as two rows and any assertion comparing printed text to fetched text
 * fails on the wrapping rather than on the bytes. A digest computed inside the
 * shell and compared against one computed over the response is immune to how
 * the answer was laid out -- and it compares all 7,570 bytes rather than a line
 * somebody chose.
 *
 * `sha256sum` is a real `just-bash` command and is not one of the six its
 * browser bundle excludes, which are `tar`, `yq`, `xan`, `sqlite3`, `python3`
 * and `python`. That exclusion list is also why the Mirror below is text: the
 * real one is `mirror.sqlite`, and there is no `sqlite3` here to read it with.
 *
 * **The paths below are typed out rather than imported from `machine.ts`, and
 * that is the one deliberate duplication here.** `test/machine.test.ts` imports
 * `LIBRARY` and `MIRROR` because it is checking that the module is internally
 * consistent. This file is checking something the module cannot vouch for: that
 * a visitor who types a path gets an answer. A spec that asked the module where
 * it had put things would pass unchanged if the module moved all of them
 * somewhere nobody would look, which is the one regression these cases exist to
 * catch. The menu entries just above are imported for the opposite reason --
 * there the list *is* the requirement, and a retyped copy is what goes stale.
 */

/**
 * The screen with its whitespace taken out.
 *
 * Wrapping inserts a row break and nothing else, so removing every space and
 * newline puts a wrapped string back together. Only ever used to look for a
 * needle long enough that rejoining the screen cannot manufacture one -- a
 * sixty-four character digest, or an address.
 */
const squashed = async (page: Page): Promise<string> =>
  (await screenText(page)).replace(/\s+/g, '')

/** SHA-256 of what the Worker is actually serving at that path, as hex. */
const served = (page: Page, name: string): Promise<string> =>
  page.evaluate(async (file) => {
    const response = await fetch(`/${file}`)
    if (!response.ok) throw new Error(`the Worker answered ${response.status} for /${file}`)

    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }, name)

/**
 * A file in the repo, resolved the way `lib/published.ts` resolves one.
 *
 * `process.cwd()` rather than `import.meta.url`, which is not available here:
 * Playwright loads a spec as CommonJS, so the meta object does not exist and
 * the file fails to parse rather than failing a case. The runner's working
 * directory is where its config lives, which is `site/`.
 */
const repo = (where: string): string => readFileSync(join(process.cwd(), where), 'utf8')

/** SHA-256 of a file in the repo, for the one artifact this Worker does not serve. */
const onDisk = (where: string): string =>
  createHash('sha256').update(readFileSync(join(process.cwd(), where))).digest('hex')

test.describe('the site’s own files', () => {
  for (const name of ['install.sh', 'install.ps1', 'discovery.json']) {
    test(`shows the same bytes the site serves for ${name}`, async ({ page }) => {
      await open(page)
      await enter(page, `sha256sum ${name}`)

      // The Worker's copy is fetched after the shell has already digested its
      // own, so a page that somehow served the file from the same place twice
      // could not make this pass by accident -- the shell reads a virtual
      // filesystem seeded at build time and has no network at all.
      expect(await squashed(page)).toContain(await served(page, name))
    })
  }

  test('shows the README, which the Worker does not serve', async ({ page }) => {
    // The one real artifact with no published counterpart, so it is checked
    // against the repo instead. It is here because `README.md` is the source of
    // truth for user-facing copy and the page already lifts its first two
    // sentences; seeding the whole document lets a visitor read the rest.
    await open(page)
    await enter(page, 'sha256sum README.md')

    expect(await squashed(page)).toContain(onDisk('../README.md'))
  })

  test('reads the discovery document, and the address the CLI resolves', async ({ page }) => {
    // `jq` against the published document, which is the criterion asking for
    // more than `cat`: the address a CLI boots against is a field rather than a
    // file, and this is it being read out as one.
    const published = JSON.parse(repo('public/discovery.json')) as { api: string }

    await open(page)
    await enter(page, 'cat discovery.json | jq -r .api')

    expect(await squashed(page)).toContain(published.api.replace(/\s+/g, ''))
  })
})

test.describe('the Library, and the Mirror recording it', () => {
  test('lists a folder per Playlist, and the Tracks inside one', async ({ page }) => {
    await open(page)

    // `~` rather than `$HOME`, because the two expand differently and both
    // have to work. This one also fails if `HOME` was left at `/`, which is
    // what `Bash` defaults it to whenever any files are seeded.
    await enter(page, 'ls -1 ~/Music/Jukebox')

    const listing = await screenText(page)
    expect(listing).toContain('Late Shift')
    expect(listing).toContain('Rain Shine')

    // Quoted `$HOME` rather than a quoted `~`, which does not expand inside
    // double quotes -- and the folder has a space in it, so it needs the
    // quoting.
    await enter(page, 'ls -1 "$HOME/Music/Jukebox/Late Shift"')

    const inside = await screenText(page)
    expect(inside).toContain('Harbour Lights')
    expect(inside).toContain('Slow Ferry')
  })

  test('descends into a Playlist folder, and the prompt follows', async ({ page }) => {
    // The criterion says *descending into one shows its tracks*, so this walks
    // rather than naming a path. It is also the case that would have caught the
    // prompt: `cd` moves what bash draws, and `harness.ts` matched a fixed
    // string until #113.
    await open(page)
    await enter(page, 'cd Music/Jukebox && ls -1')

    expect(await screenText(page)).toContain('Rain Shine')

    await enter(page, 'cd "Rain Shine" && ls -1')

    expect(await screenText(page)).toContain('Long Way Down')
  })

  test('leaves the Mirror somewhere a plain listing finds', async ({ page }) => {
    // **The case a code review had to catch, because nothing else could.** The
    // record carries the one Track at tier `none`, which is the page's only
    // honest sentence about coverage -- and at the CLI's default path it sits
    // in `~/.local/share`, which `ls` does not show and nothing here names. It
    // was reachable only by a visitor who already knew where to look, which is
    // the same as unreachable.
    //
    // `JUKEBOX_HOME` is the CLI's own way out and this asserts both halves of
    // it: the folder is in a bare listing, and the environment says why.
    await open(page)
    await enter(page, 'ls -1 ~')

    expect(await screenText(page)).toContain('jukebox')

    await enter(page, 'echo $JUKEBOX_HOME && ls -1 "$JUKEBOX_HOME/data/mirror"')

    const found = await screenText(page)
    expect(found).toContain('playlists.txt')
    expect(found).toContain('Late Shift.txt')
  })

  test('records a Track whose match has tier none', async ({ page }) => {
    // The honest coverage story, asked of the Mirror rather than of the folder,
    // because a Tier is a property of a Match and not of a file. `none` is a
    // correct and common answer; a page whose every Track had matched would be
    // making a claim about the open Catalogs that nothing supports.
    await open(page)
    await enter(page, 'grep -c none "$HOME/jukebox/data/mirror/Late Shift.txt"')

    const counted = await screenText(page)
    expect(counted).toMatch(/\b1\b/)

    // And the Track it belongs to has no file, which is the other half of the
    // same fact: nothing matched, so there was nothing to download.
    await enter(page, 'ls -1 "$HOME/Music/Jukebox/Late Shift"')

    expect(await screenText(page)).not.toContain('Nightjar')
  })
})

test.describe('these are files rather than printed strings', () => {
  test('pipes and redirects across a seeded file', async ({ page }) => {
    // The criterion that separates a filesystem from a command that prints. A
    // string cannot be redirected into a new file and then measured; a file
    // can, and the measurement has to come out as the installer's own length.
    const lines = repo('public/install.sh').split('\n').length - 1

    await open(page)
    await enter(page, 'cat install.sh > copy.sh')

    // `wc -l < copy.sh` rather than `wc -l copy.sh`, so the answer is a bare
    // number with no filename beside it to wrap at a narrow viewport. It also
    // makes the second half of the pair a redirect in the other direction.
    await enter(page, 'wc -l < copy.sh')

    expect(await squashed(page)).toContain(String(lines))
  })

  test('counts the Playlists the Mirror holds through a pipe', async ({ page }) => {
    await open(page)
    await enter(page, 'cat "$HOME/jukebox/data/mirror/playlists.txt" | wc -l')

    expect(await squashed(page)).toContain('2')
  })
})

test.describe('the greeting the shell opens with', () => {
  test('prints the five menu entries, and every one of them runs', async ({ page }) => {
    // #112 asked for this and #113 is where the fifth of them is true. `quit`
    // was in the greeting and in no registry, so the page printed a word and
    // then refused it.
    // Derived from the greeting's own list rather than written out twice, the
    // way `test/commands.test.ts` derives it: a sixth entry has to arrive here
    // as well, and a list retyped in a spec is a list that stops agreeing.
    const entries = MENU_ENTRIES.map((entry) => entry.label)
    expect(entries).toHaveLength(5)

    await open(page)

    const greeted = await screenText(page)
    for (const entry of entries) expect(greeted).toContain(entry)

    for (const entry of entries) await enter(page, entry)

    expect(await screenText(page)).not.toContain('command not found')
  })
})
