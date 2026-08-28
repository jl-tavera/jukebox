import { CopyButton } from '@/components/copy-button'
import { INSTALL_COMMAND } from '@/lib/content'

export function CopyCommand() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5">
      <code className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap text-[0.6875rem] sm:text-[0.9375rem]">
        <span className="text-dim select-none" aria-hidden="true">
          ${' '}
        </span>
        {INSTALL_COMMAND}
      </code>

      <CopyButton
        value={INSTALL_COMMAND}
        what="install command"
        className="self-center text-[0.75rem] sm:self-auto sm:text-[0.8125rem]"
      />
    </div>
  )
}
