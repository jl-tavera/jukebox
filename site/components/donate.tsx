import { CopyButton } from '@/components/copy-button'
import { donations, isConfigured, truncateAddress } from '@/lib/content'

/**
 * Native <details>, not React state: keyboard support, correct semantics and
 * open/close all come free, it works with JavaScript disabled, and this stays
 * a server component. Only the copy buttons cross into the client.
 */
export function Donate() {
  return (
    <details className="mt-12 w-full max-w-[34rem]">
      <summary className="text-center text-[0.75rem] text-dim transition-colors hover:text-ink sm:text-[0.8125rem]">
        <span className="u-when-closed">[donate]</span>
        <span className="u-when-open">[close]</span>
      </summary>

      <div className="mt-7 text-left">
        <div className="flex items-center gap-3 text-[0.625rem] text-dim sm:text-[0.6875rem]">
          <span>support</span>
          <span className="h-px flex-1 bg-dim opacity-30" aria-hidden="true" />
        </div>

        <ul className="mt-4 flex flex-col gap-3.5">
          {donations.map((donation) => (
            <li
              key={donation.chain}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1"
            >
              <span className="text-[0.6875rem] text-dim sm:text-[0.75rem]">
                {donation.chain}
              </span>

              {isConfigured(donation.address) ? (
                <>
                  <code
                    title={donation.address}
                    className="min-w-0 truncate text-[0.75rem] sm:text-[0.8125rem]"
                  >
                    {truncateAddress(donation.address)}
                  </code>
                  <CopyButton
                    value={donation.address}
                    what={`${donation.label} address`}
                    className="text-[0.625rem] sm:text-[0.6875rem]"
                  />
                </>
              ) : (
                // No copy button on an unconfigured row. A donor must not be
                // able to put a placeholder on their clipboard.
                <span className="col-start-2 col-end-4 text-[0.75rem] text-dim">
                  not configured
                </span>
              )}

              {donation.note ? (
                <span className="col-start-2 col-end-4 text-[0.625rem] leading-[1.6] text-dim sm:text-[0.6875rem]">
                  {donation.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
