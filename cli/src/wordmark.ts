/**
 * The wordmark, and the one thing a terminal does with it that a page does not.
 *
 * A copy of `site/lib/content.ts`'s constant, byte for byte, checked against it
 * by `bun run --cwd cli check:wordmark`. Duplicated rather than shared: #50
 * settled that `schema/` is the client/server contract and a piece of art is not
 * that, and that one string does not earn a workspace of its own. The two copies
 * want different notes around them as well -- the site's explains a webfont
 * fallback, and this one explains width. Change the site's first, then copy it
 * across whole.
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
 * already happened once to the site's copy by hand-copying, which is why this
 * one was extracted rather than retyped, and why the check counts columns
 * instead of only comparing the two.
 */
export const WORDMARK = `     ███ ███   ███ ███   ███ ████████ ██████▄   ▄██████▄  ███▄ ▄███
     ███ ███   ███ ███  ▄██▀ ███      ███  ▐█▌ ███▀  ▀███  ▀█████▀ 
███  ███ ███   ███ ███▀▀██▄  ███▀▀▀   ███▀▀▀█▄ ███    ███   ▄███▄  
███▄▄███ ███▄▄▄███ ███   ███ ███▄▄▄▄▄ ███▄▄▄██ ▀███▄▄███▀ ▄███▀███▄
 ▀▀▀▀▀▀   ▀▀▀▀▀▀▀  ▀▀▀   ▀▀▀ ▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀    ▀▀▀▀▀▀   ▀▀▀   ▀▀▀`
