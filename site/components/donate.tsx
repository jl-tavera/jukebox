'use client'

import { useRef } from 'react'
import { CopyButton } from '@/components/copy-button'
import {
  DONATIONS_ARE_EXAMPLES,
  donations,
  isConfigured,
  truncateAddress,
} from '@/lib/content'

/**
 * Native <dialog> opened with showModal(), not a hand-rolled overlay: focus
 * trapping, Escape to close, returning focus to the trigger, and marking the
 * rest of the page inert all come from the platform and are the parts of a
 * modal most often got wrong by hand.
 */
export function Donate() {
  const ref = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="mt-12 text-[0.75rem] text-dim transition-colors hover:text-ink sm:text-[0.8125rem]"
      >
        [donate]
      </button>

      <dialog
        ref={ref}
        aria-labelledby="donate-title"
        className="u-dialog"
        // The dialog element itself is only reachable where the backdrop is,
        // because all padding lives on the inner wrapper.
        onClick={(event) => {
          if (event.target === ref.current) ref.current?.close()
        }}
      >
        <div className="p-6 text-left sm:p-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="donate-title" className="text-[0.8125rem] sm:text-[0.875rem]">
              support jukebox
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="shrink-0 text-[0.6875rem] text-dim transition-colors hover:text-ink sm:text-[0.75rem]"
            >
              [close]
            </button>
          </div>

          {DONATIONS_ARE_EXAMPLES ? (
            <p className="mt-5 border border-dim px-3 py-2.5 text-[0.625rem] leading-[1.7] text-dim sm:text-[0.6875rem]">
              example addresses — not live yet. these are deliberately invalid
              and every wallet will reject them. do not send funds.
            </p>
          ) : null}

          <ul className="mt-5 flex flex-col gap-4">
            {donations.map((donation) => (
              <li
                key={donation.chain}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1"
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
      </dialog>
    </>
  )
}
