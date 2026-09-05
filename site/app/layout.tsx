import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { RESTING } from '@/lib/session/theme'
import { hero } from '@/lib/content'
import './globals.css'

// The page is set in Monaspace Neon and Argon, vendored into public/fonts and
// served from this origin. No request leaves for a font CDN, which is what keeps
// SITE.md 07's no-third-party rule intact through a redesign that could easily
// have broken it.
//
// This used to say the opposite, and its reasoning was sound: a subsetted
// webfont drops the block-element glyphs the wordmark is built from, and a
// per-glyph fallback with different metrics shears the art apart. ADR-0010
// traded that guarantee for a subset that whitelists those glyphs explicitly, a
// check that reads them back out of the built export, and #83 measuring the
// rendered rows in a real browser. See docs/design/SITE.md 03.

export const metadata: Metadata = {
  metadataBase: new URL('https://jukebox.dev'),
  title: 'Jukebox — Sync your playlists. Own your music.',
  description: hero.lede,
  openGraph: {
    title: 'Jukebox — Sync your playlists. Own your music.',
    description: hero.lede,
    url: '/',
    siteName: 'Jukebox',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffd400' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Both faces, preloaded. React hoists these into <head>.

            `crossOrigin` is required on a font preload even same-origin. A font
            is fetched in CORS mode whatever its origin, so a preload without it
            lands under a different cache key than the request the stylesheet
            makes, and the browser downloads each face twice.

            This is load-bearing rather than an optimisation, because
            `font-display: block` in globals.css means the wordmark holds its
            paint until the face arrives -- how fast it arrives is how fast the
            page draws. `check:fonts` fails if either link stops naming a file
            that is published. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/monaspace-neon.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/monaspace-argon.woff2"
          crossOrigin="anonymous"
        />

        {/* next-themes ships its own "use client", so it drops straight into
            a server layout. Its inline script runs before paint, which is what
            keeps a statically exported page from flashing the wrong theme.

            The default comes from `theme.ts` rather than from a literal,
            because since #88 three things have to agree about what a page
            nobody has chosen for is in: this, the reducer's first state, and
            what a bare `theme` reports before the provider has answered. One
            value is how they agree. */}
        <ThemeProvider
          attribute="class"
          defaultTheme={RESTING.theme}
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
