/**
 * The wordmark, and the one thing a terminal does with it that a page does not.
 *
 * **Generated. Do not edit the constant below by hand.** It is written from the
 * banner at the top of `docs/design/DESIGN.md` by `bun run --cwd cli
 * generate:wordmark`, and CI regenerates and diffs, so an edit made here is an
 * edit CI will undo. Change the document, run the generator, commit what it
 * wrote.
 *
 * Generated rather than shared: #50 settled that `schema/` is the client/server
 * contract and a piece of art is not that, and that one string does not earn a
 * workspace of its own. The prose around each copy still differs -- the site's
 * explains a webfont fallback, and this one explains width -- which is why the
 * generator splices the literal rather than writing the file.
 *
 * **Sixty-seven columns, every row.** A page too narrow for the art clips it; a
 * terminal too narrow wraps every row onto the next, and the mark becomes noise
 * rather than a smaller mark. Below 67 columns something else is drawn instead,
 * which `header.ts` does. This file is the art at its natural width and carries
 * no escape sequences: the colour goes on around each row on the way out and is
 * never stored here, which is what keeps the width countable and these bytes
 * comparable to the site's.
 *
 * Built from Block Elements (U+2580-U+259F) and spaces. On the site that range
 * is the reason there is no webfont; here it is the reason the art renders at
 * all -- a terminal font carries these glyphs when it carries no other
 * decorative range, because terminals need them.
 *
 * Two rows end in a space, and losing one shears the letterforms. That has
 * already happened once, by hand-copying, which is why nothing here is typed by
 * a person any more and why the generator counts columns before it writes
 * rather than only checking that two files agree -- two copies can be wrong
 * together, and were.
 */
export const WORDMARK = `     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
     ███ ███   ███ ███  ▄██▀ ███      ███  ▐█▌ ███▀  ▀███  ▀█████▀ 
███  ███ ███   ███ ███▀▀██▄  ███▀▀▀   ███▀▀▀█▄ ███    ███   ▄███▄  
███▄▄███ ███▄▄▄███ ███   ███ ███▄▄▄▄▄ ███▄▄▄██ ▀███▄▄███▀ ▄███▀███▄
 ▀▀▀▀▀▀   ▀▀▀▀▀▀▀  ▀▀▀   ▀▀▀ ▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀    ▀▀▀▀▀▀   ▀▀▀   ▀▀▀`
