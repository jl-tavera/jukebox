'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/**
 * Three states, not two. Once someone touches a binary toggle they can
 * never get back to "follow my system", so system stays in the cycle.
 */
const ORDER = ['system', 'light', 'dark'] as const
type Mode = (typeof ORDER)[number]

const LABEL: Record<Mode, string> = {
  system: 'Theme: follow system. Switch to light.',
  light: 'Theme: light. Switch to dark.',
  dark: 'Theme: dark. Follow system instead.',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The stored preference lives in localStorage, so it is unreadable until
  // after hydration. Render the system state until then.
  useEffect(() => setMounted(true), [])

  const mode: Mode =
    mounted && (ORDER as readonly string[]).includes(theme ?? '')
      ? (theme as Mode)
      : 'system'

  return (
    <button
      type="button"
      onClick={() => setTheme(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length])}
      aria-label={LABEL[mode]}
      title={LABEL[mode]}
      className="text-[0.75rem] text-dim transition-colors hover:text-ink sm:text-[0.8125rem]"
    >
      [theme: {mode}]
    </button>
  )
}
