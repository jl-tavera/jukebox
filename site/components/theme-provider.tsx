'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * next-themes injects a blocking inline script, which is what keeps a
 * statically exported page from painting the wrong theme first. The server
 * has no way to know the preference, so this has to run before paint.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
