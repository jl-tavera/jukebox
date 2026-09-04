import { brotliDecompressSync } from 'node:zlib'

/**
 * Reads which code points a WOFF2 file maps, out of the bytes themselves.
 *
 * **Why this is hand-written rather than a dependency.** `check-fonts.ts` runs
 * on every build and in CI, and the one property worth having there is that it
 * needs nothing installed -- no font library, no Python, no wasm blob in
 * `bun.lock`. A `cmap` is a small, stable, thirty-year-old table, and reading
 * one is less code than the dependency that would read it. `build-fonts.ts` is
 * where fontTools lives, and it is the half that does not run in CI.
 *
 * **Why it can be this short.** WOFF2 transforms exactly two tables, `glyf` and
 * `loca`, and `cmap` is not one of them -- so once the container is unwrapped
 * and the brotli stream is decompressed, `cmap` is byte-identical to its sfnt
 * form and needs no untransforming. The transforms still have to be *parsed*,
 * because their lengths are what say where every later table starts.
 *
 * **Every failure throws, and none returns an empty set.** A reader that
 * answered "no code points" for a file it did not understand would turn the
 * check that depends on it into a check that passes on a truncated download.
 * The distinction matters more here than the message does: an empty set would
 * fail the caller's assertion too, but it would fail it saying the subset
 * dropped Block Elements, which is a sentence that sends somebody to the wrong
 * file.
 *
 * Reference: W3C WOFF2 file format, sections 4 and 5.
 */

/** `wOF2`. Anything else is not this format, whatever its extension says. */
const SIGNATURE = 0x774f4632

/** Header through `privLength`, before the table directory starts. */
const HEADER_BYTES = 48

/**
 * The tags a WOFF2 directory can name by index instead of spelling out, in the
 * order the specification fixes. Index 63 means an arbitrary tag follows
 * instead, which is what `ARBITRARY` below tests for.
 */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post',
  'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
] as const

const ARBITRARY = 0x3f

/**
 * A sane ceiling on how many code points one font may claim to map.
 *
 * Unicode has fewer than 1.1M assigned positions, so anything past this is a
 * malformed group rather than an ambitious font -- and without the ceiling a
 * corrupt `endCharCode` turns a check into an out-of-memory kill, which reads
 * to whoever is watching CI as a flake rather than as a bad font.
 */
const CEILING = 0x110000

class Woff2Error extends Error {}

/**
 * Annotated on the binding rather than on the arrow, which
 * `cli/scripts/generate-wordmark.ts` explains and this file proved: TypeScript
 * narrows after a call only when the *variable* is typed as returning `never`,
 * so with the annotation on the arrow alone the code after every bare `fail(...)`
 * stays reachable -- and the reader gets a non-null assertion papering over it.
 * There was one, on the `found` destructure below, until this line was fixed.
 *
 * One string rather than the `(...lines: string[])` the four scripts take,
 * because this one throws where they exit. The caller is `check-fonts.ts`, and
 * it is the caller that owns the multi-line report: it wraps whatever comes back
 * here with which file failed and how to regenerate it, which is the "consequence
 * and way back" those scripts write inline.
 */
const fail: (why: string) => never = (why) => {
  throw new Woff2Error(why)
}

/**
 * The directory's own integer encoding: base 128, big-endian, high bit set on
 * every byte but the last. Five bytes is the specified maximum, and a leading
 * `0x80` is a zero written the long way, which the format forbids so that one
 * number has one encoding.
 */
const uintBase128 = (bytes: Uint8Array, start: number): [value: number, next: number] => {
  let value = 0

  for (let index = 0; index < 5; index += 1) {
    const at = start + index
    if (at >= bytes.length) fail('a table directory entry runs past the end of the file')

    const byte = bytes[at]!
    if (index === 0 && byte === 0x80) fail('a table directory entry has a non-minimal length')

    value = value * 128 + (byte & 0x7f)
    if (value > 0xffffffff) fail('a table directory entry declares an impossible length')

    if ((byte & 0x80) === 0) return [value, at + 1]
  }

  return fail('a table directory entry has a length longer than five bytes')
}

/**
 * Whether a table is stored transformed, which is what decides whether its
 * entry carries a second length.
 *
 * The rule is inverted for the two tables that have a real transform: for
 * `glyf` and `loca`, version 3 is the null transform, and for everything else
 * it is version 0. Getting this backwards does not fail here -- it shifts every
 * later table's offset by the size of one length field, and the wrong bytes get
 * read as a `cmap`.
 */
const isTransformed = (tag: string, version: number): boolean =>
  tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0

/** The `cmap` table, sliced out of the decompressed font data. */
const cmapTable = (file: Uint8Array): Uint8Array => {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)

  if (file.byteLength < HEADER_BYTES) fail('the file is too short to be a WOFF2')
  if (view.getUint32(0) !== SIGNATURE) fail('the file does not open with the WOFF2 signature')

  const numTables = view.getUint16(12)
  if (numTables === 0) fail('the file declares no tables')

  let cursor = HEADER_BYTES
  let offset = 0
  let found: { at: number; length: number } | undefined

  for (let index = 0; index < numTables; index += 1) {
    if (cursor >= file.byteLength) fail('the table directory runs past the end of the file')

    const flags = file[cursor]!
    cursor += 1

    let tag: string
    if ((flags & ARBITRARY) === ARBITRARY) {
      tag = String.fromCharCode(...file.subarray(cursor, cursor + 4))
      cursor += 4
    } else {
      tag = KNOWN_TAGS[flags & ARBITRARY] ?? fail('a table directory entry names no known tag')
    }

    const [originalLength, afterOriginal] = uintBase128(file, cursor)
    cursor = afterOriginal

    let length = originalLength
    if (isTransformed(tag, flags >> 6)) {
      const [transformedLength, afterTransformed] = uintBase128(file, cursor)
      cursor = afterTransformed
      length = transformedLength
    }

    // Recorded rather than returned, because the loop has to keep running: the
    // offset of a table is the sum of every length before it, and stopping at
    // `cmap` would only work while `cmap` is last.
    if (tag === 'cmap') found = { at: offset, length }

    offset += length
  }

  if (found === undefined) fail('the font has no cmap table, so it maps no code points at all')

  let data: Buffer
  try {
    data = brotliDecompressSync(file.subarray(cursor))
  } catch (cause) {
    return fail(`the compressed font data would not decompress: ${(cause as Error).message}`)
  }

  const { at, length } = found
  if (at + length > data.byteLength) fail('the cmap table runs past the end of the font data')

  return new Uint8Array(data.subarray(at, at + length))
}

/** Format 4: segment mapping to delta values, the BMP-only encoding. */
const readFormat4 = (view: DataView, start: number, into: Set<number>): void => {
  const segCount = view.getUint16(start + 6) / 2
  const endCodes = start + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2

  for (let segment = 0; segment < segCount; segment += 1) {
    const end = view.getUint16(endCodes + segment * 2)
    const first = view.getUint16(startCodes + segment * 2)
    const delta = view.getInt16(idDeltas + segment * 2)
    const rangeOffset = view.getUint16(idRangeOffsets + segment * 2)

    // The final segment is the required 0xFFFF terminator rather than a mapping.
    if (first > end || first === 0xffff) continue

    for (let code = first; code <= end; code += 1) {
      let glyph: number

      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        // The one genuinely strange address in the format: the offset is
        // counted from the position of the idRangeOffset entry itself.
        const at = idRangeOffsets + segment * 2 + rangeOffset + (code - first) * 2
        if (at + 1 >= view.byteLength) continue
        const raw = view.getUint16(at)
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
      }

      // Glyph 0 is .notdef: the code point is listed but resolves to nothing,
      // which for a coverage question is the same as absent.
      if (glyph !== 0) into.add(code)
    }
  }
}

/** Format 12: segmented coverage, the encoding that reaches past the BMP. */
const readFormat12 = (view: DataView, start: number, into: Set<number>): void => {
  const groups = view.getUint32(start + 12)

  for (let group = 0; group < groups; group += 1) {
    const at = start + 16 + group * 12
    if (at + 12 > view.byteLength) return

    const first = view.getUint32(at)
    const end = view.getUint32(at + 4)
    const startGlyph = view.getUint32(at + 8)

    if (first > end || end >= CEILING) continue

    for (let code = first; code <= end; code += 1) {
      // Tested per code point rather than per group. A group states one
      // starting glyph and walks up from it, so a group starting at .notdef
      // maps only its own first code point to nothing -- every later one steps
      // into real glyphs. Skipping the whole group would under-report coverage,
      // which is the one answer this module must never give.
      if (startGlyph + (code - first) !== 0) into.add(code)
    }
  }
}

/**
 * Every code point the font maps, read out of a WOFF2 file.
 *
 * Every parseable subtable is unioned rather than one "best" subtable being
 * chosen. A font is covered if any of its encodings covers it, which is the
 * question a browser asks too, and picking one subtable would mean this
 * answered a narrower question than the one the check is asking.
 *
 * @throws if the bytes are not a WOFF2, or carry no readable `cmap`.
 */
export const codepoints = (bytes: Uint8Array): Set<number> => {
  const table = cmapTable(bytes)
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength)

  if (table.byteLength < 4) fail('the cmap table is too short to declare any subtables')

  const subtables = view.getUint16(2)
  const found = new Set<number>()
  let read = 0

  for (let index = 0; index < subtables; index += 1) {
    const record = 4 + index * 8
    if (record + 8 > table.byteLength) break

    const start = view.getUint32(record + 4)
    if (start + 2 > table.byteLength) continue

    const format = view.getUint16(start)
    if (format === 4) readFormat4(view, start, found)
    else if (format === 12) readFormat12(view, start, found)
    else continue

    read += 1
  }

  if (read === 0) fail('the cmap table has no subtable in format 4 or 12')

  return found
}
