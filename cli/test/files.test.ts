import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { partOf, replaceFile } from '../src/files'
import { removeHomes, temporaryHome } from './harness'

/**
 * A pure-enough seam: one function, a real filesystem, a directory of its own.
 *
 * Real rather than faked, because every interesting thing here is the operating
 * system's answer rather than ours -- a rename onto a directory, a write into a
 * path that is one. A fake would only ever tell us what we already assumed.
 */

afterAll(removeHomes)

const somewhere = (name: string) => join(temporaryHome('jukebox-files-'), name)

/** Everything sitting next to the target, so a stray part file is visible. */
const beside = (path: string) => [...new Bun.Glob('**/*').scanSync(join(path, '..'))].sort()

describe('replacing a file', () => {
  it('writes one that was not there, and the directory it goes in', () => {
    const target = join(somewhere('nested'), 'deeper', 'settings.toml')

    replaceFile(target, 'x = 1\n')

    expect(readFileSync(target, 'utf8')).toBe('x = 1\n')
  })

  it('replaces one that was, rather than adding to it', () => {
    const target = somewhere('twice.toml')

    replaceFile(target, 'first\n')
    replaceFile(target, 'second\n')

    expect(readFileSync(target, 'utf8')).toBe('second\n')
  })

  it('leaves nothing beside it', () => {
    // The part file is an implementation detail right up until one survives, at
    // which point it is a file in the user's configuration directory that
    // nothing will ever clean up.
    const target = somewhere('tidy.toml')

    replaceFile(target, 'x = 1\n')

    expect(beside(target)).toEqual(['tidy.toml'])
  })
})

describe('a write the operating system refuses', () => {
  it('throws rather than passing for a write that happened', () => {
    // A directory where the file should go. The caller has to be able to tell
    // this from success, which is the whole difference between this and the
    // discovery cache.
    const target = somewhere('occupied')
    mkdirSync(target, { recursive: true })

    expect(() => replaceFile(target, 'x = 1\n')).toThrow()
  })

  it('still leaves no part file behind', () => {
    // The leak this function exists to not have: `cache.ts` wrote the part,
    // failed the rename, swallowed the error, and left the part there forever.
    const target = somewhere('occupied')
    mkdirSync(target, { recursive: true })

    expect(() => replaceFile(target, 'x = 1\n')).toThrow()

    // Empty, and the directory in the way is not in it -- the glob lists files.
    // A surviving `occupied.<pid>.part` is a file, so it would be.
    expect(beside(target)).toEqual([])
  })

  it('leaves the file that was already there exactly as it was', () => {
    // The atomicity claim, cashed in. A part file that cannot be written must
    // not be able to touch the target -- so a directory is put in the part's
    // way, which is why `partOf` is exported.
    const target = somewhere('precious.toml')
    writeFileSync(target, 'the old one\n')
    mkdirSync(partOf(target), { recursive: true })

    expect(() => replaceFile(target, 'the new one\n')).toThrow()
    expect(readFileSync(target, 'utf8')).toBe('the old one\n')
  })
})
