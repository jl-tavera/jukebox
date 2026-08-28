'use client'

import { useEffect, useState, type ReactNode } from 'react'
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

const ICON: Record<Mode, ReactNode> = {
  system: (
    <>
      <rect x="2.5" y="3" width="11" height="8" rx="1" />
      <path d="M6 13.5h4" />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.9 3.1l-1 1M4.1 11.9l-1 1M12.9 12.9l-1-1M4.1 4.1l-1-1" />
    </>
  ),
  dark: <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />,
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
      className="flex items-center gap-2 rounded-[2px] border border-rule px-2.5 py-1.5 text-ink transition-colors hover:border-accent-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICON[mode]}
      </svg>
      <span className="u-mono hidden w-[3.25rem] text-left text-muted sm:inline">
        {mounted ? mode : ''}
      </span>
    </button>
  )
}
