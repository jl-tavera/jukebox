'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * `failed` is a real state, not defensive padding: the Clipboard API is
 * unavailable on insecure origins and blocked outright in some browsers.
 * Reporting a success that did not happen is worse than reporting nothing.
 */
type State = 'idle' | 'copied' | 'failed'

const LABEL: Record<State, string> = {
  idle: 'copy',
  copied: 'copied',
  failed: 'select it',
}

export function CopyButton({
  value,
  what,
  className = '',
}: {
  /** The full value. Never the truncated display string. */
  value: string
  /** Names the thing being copied, for the accessible label and status. */
  what: string
  className?: string
}) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    if (timer.current) clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = setTimeout(() => setState('idle'), 2200)
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${what}`}
        className={`shrink-0 text-dim transition-colors hover:text-ink ${className}`}
      >
        [{LABEL[state]}]
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied'
          ? `${what} copied to clipboard`
          : state === 'failed'
            ? `Could not copy ${what}. Select it manually.`
            : ''}
      </span>
    </>
  )
}
