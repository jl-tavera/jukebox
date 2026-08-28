'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Copy-to-clipboard with a self-clearing result.
 *
 * `failed` is a real state, not defensive padding: the Clipboard API is
 * unavailable on insecure origins and blocked outright in some browsers.
 * Reporting a success that did not happen is worse than reporting nothing.
 */
export function useCopy(resetAfterMs = 2200) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(
    async (value: string) => {
      if (timer.current) clearTimeout(timer.current)
      try {
        await navigator.clipboard.writeText(value)
        setState('copied')
      } catch {
        setState('failed')
      }
      timer.current = setTimeout(() => setState('idle'), resetAfterMs)
    },
    [resetAfterMs],
  )

  return { state, copy }
}
