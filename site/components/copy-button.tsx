'use client'

import { useCopy } from '@/lib/use-copy'
import { cn } from '@/lib/utils'

const LABEL = {
  idle: 'copy',
  copied: 'copied',
  failed: 'select it',
} as const

export function CopyButton({
  value,
  what,
  className,
}: {
  /** The full value. Never the truncated display string. */
  value: string
  /** Names the thing being copied, for the accessible label and status. */
  what: string
  className?: string
}) {
  const { state, copy } = useCopy()

  return (
    <>
      <button
        type="button"
        onClick={() => copy(value)}
        aria-label={`Copy ${what}`}
        className={cn(
          'shrink-0 text-dim transition-colors hover:text-ink',
          className,
        )}
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
