import { cn } from '@/lib/utils'
import { ledger, type Tier } from '@/lib/content'

/**
 * Tier renders as luminance: how much light a row gets is how confident
 * the match is. Most rows are dark, which is the honest shape of a real
 * playlist against open catalogs. See docs/design/SITE.md 03.
 *
 * Colour is never the only signal — every row also names its tier in text.
 */
const ROW: Record<Tier, string> = {
  exact: 'border-l-accent bg-accent text-on-accent',
  probable: 'border-l-accent bg-surface text-ink',
  weak: 'border-l-rule bg-surface text-muted',
  none: 'border-l-transparent bg-transparent text-muted',
}

const BADGE: Record<Tier, string> = {
  exact: 'text-on-accent',
  probable: 'text-accent-ink',
  weak: 'text-muted',
  none: 'text-muted',
}

/** Secondary text inside a lit row has to sit on yellow, not on the ground. */
const SUB: Record<Tier, string> = {
  exact: 'text-on-accent/70',
  probable: 'text-muted',
  weak: 'text-muted',
  none: 'text-muted',
}

export function MatchLedger() {
  return (
    <div>
      <div
        aria-hidden="true"
        className="u-mono hidden grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_5.25rem] gap-x-5 border-b border-rule px-3 pb-2.5 text-muted sm:grid"
      >
        <span>#</span>
        <span>Playlist entry</span>
        <span>Open catalog match</span>
        <span className="text-right">Tier</span>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {ledger.map((row, i) => (
          <li
            key={row.n}
            className="u-strip-in"
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <div
              className={cn(
                'grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem] items-baseline gap-x-3 gap-y-1.5 rounded-[2px] border-l-[3px] px-3 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_5.25rem] sm:gap-x-5',
                ROW[row.tier],
              )}
            >
              <span className={cn('u-mono col-start-1 row-start-1', SUB[row.tier])}>
                {row.n}
              </span>

              <div className="col-start-2 row-start-1 min-w-0">
                <div className="u-strip truncate text-[1.0625rem]">{row.title}</div>
                <div className={cn('truncate text-[0.8125rem]', SUB[row.tier])}>
                  {row.artist}
                </div>
              </div>

              <div className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
                {row.match ? (
                  <>
                    <div className="u-strip truncate text-[1.0625rem]">
                      <span className={cn('mr-1.5', SUB[row.tier])} aria-hidden="true">
                        →
                      </span>
                      {row.match.title}
                    </div>
                    <div className={cn('u-mono truncate', SUB[row.tier])}>
                      {row.match.catalog} · {row.match.artist}
                    </div>
                  </>
                ) : (
                  <div className={cn('truncate text-[0.9375rem]', SUB[row.tier])}>
                    <span className="mr-1.5" aria-hidden="true">
                      →
                    </span>
                    no open equivalent
                  </div>
                )}
              </div>

              <span
                className={cn(
                  'u-mono col-start-3 row-start-1 justify-self-end sm:col-start-4',
                  BADGE[row.tier],
                )}
              >
                {row.tier}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
