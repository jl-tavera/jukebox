import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { hero } from '@/lib/content'
import './globals.css'

// No webfont on purpose. The page renders in the visitor's system monospace,
// which is the only stack guaranteed to carry the block-element glyphs the
// wordmark is built from. See docs/design/SITE.md 03.

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
        {/* next-themes ships its own "use client", so it drops straight into
            a server layout. Its inline script runs before paint, which is what
            keeps a statically exported page from flashing the wrong theme. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
