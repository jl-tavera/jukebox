'use client'

import { useEffect, useRef, useState } from 'react'
import { INSTALL_COMMAND } from '@/lib/content'

type State = 'idle' | 'copied' | 'failed'

const LABEL: Record<State, string> = {
  idle: 'copy',
  copied: 'copied',
  failed: 'select it',
}

export function CopyCommand() {
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
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      setState('copied')
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers.
      // Say so rather than showing a success that did not happen.
      setState('failed')
    }
    timer.current = setTimeout(() => setState('idle'), 2200)
  }

  return (
    <div className="flex items-stretch gap-0 rounded-[2px] border border-rule bg-surface">
      <code className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto px-4 py-3.5 font-mono text-[0.8125rem] whitespace-nowrap text-ink">
        <span className="shrink-0 select-none text-accent-ink" aria-hidden="true">
          $
        </span>
        {INSTALL_COMMAND}
      </code>
      <button
        type="button"
        onClick={copy}
        className="u-mono shrink-0 border-l border-rule px-4 text-muted transition-colors hover:bg-accent hover:text-on-accent"
      >
        {LABEL[state]}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied'
          ? 'Install command copied to clipboard'
          : state === 'failed'
            ? 'Could not copy. Select the command manually.'
            : ''}
      </span>
    </div>
  )
}
