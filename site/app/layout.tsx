import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { hero } from '@/lib/content'
import './globals.css'

// No webfont on purpose. The page renders in the visitor's system monospace,
// which is the only stack guaranteed to carry the box-drawing glyphs the
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
