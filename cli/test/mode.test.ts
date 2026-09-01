import { describe, expect, it } from 'bun:test'
import { Readable } from 'node:stream'
import type { Io } from '../src/io'
import { promptsAllowed, selectMode } from '../src/mode'

/**
 * The other pure seam. Two questions, four answers each, and the combinatorial
 * shape is exactly why they are asked here rather than through a command.
 */

const io = (streams: { stdout?: boolean; stdin?: boolean }): Io => ({
  out: () => {},
  err: () => {},
  // Empty, and inert like the two sinks above it. Both questions below are
  // asked about whether a keyboard may be read, never by reading one -- a
  // stream with anything in it here would suggest otherwise.
  in: Readable.from([]),
  stdoutIsTty: streams.stdout ?? true,
  stdinIsTty: streams.stdin ?? true,
})

describe('choosing how to render', () => {
  it('renders for a human at a terminal', () => {
    expect(selectMode(false, io({ stdout: true }))).toBe('human')
  })

  it('renders JSON when asked for it', () => {
    expect(selectMode(true, io({ stdout: true }))).toBe('json')
  })

  it('renders JSON when stdout is not a terminal', () => {
    // A pipe or a redirect is something reading the output rather than someone.
    // Waiting to be asked would mean every script had to remember the flag.
    expect(selectMode(false, io({ stdout: false }))).toBe('json')
  })

  it('renders JSON when both say so', () => {
    expect(selectMode(true, io({ stdout: false }))).toBe('json')
  })
})

describe('whether anything may prompt', () => {
  it('allows a prompt only for a human typing at a terminal', () => {
    expect(promptsAllowed('human', io({ stdin: true }))).toBe(true)
  })

  it('refuses one in JSON mode, whatever stdin is', () => {
    // The output is being parsed. A question printed into it is neither
    // answerable nor valid JSON.
    expect(promptsAllowed('json', io({ stdin: true }))).toBe(false)
    expect(promptsAllowed('json', io({ stdin: false }))).toBe(false)
  })

  it('refuses one when nobody can answer it', () => {
    // A pipe, a CI job, a cron entry. Asking here is not a slow command, it is
    // a hung one -- so a missing answer has to be an error rather than a wait.
    expect(promptsAllowed('human', io({ stdin: false }))).toBe(false)
  })
})
