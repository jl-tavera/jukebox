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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5">
      <code className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap text-[0.6875rem] sm:text-[0.9375rem]">
        <span className="text-dim select-none" aria-hidden="true">
          ${' '}
        </span>
        {INSTALL_COMMAND}
      </code>

      <button
        type="button"
        onClick={copy}
        className="shrink-0 self-center text-[0.75rem] text-dim transition-colors hover:text-ink sm:self-auto sm:text-[0.8125rem]"
      >
        [{LABEL[state]}]
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
