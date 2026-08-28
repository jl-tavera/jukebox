import { CopyCommand } from '@/components/copy-command'
import { MatchLedger } from '@/components/match-ledger'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  REPO_URL,
  catalogs,
  concerns,
  hero,
  ledgerCopy,
  nonGoals,
} from '@/lib/content'

const NAV_LINK =
  'u-mono text-muted transition-colors hover:text-ink focus-visible:text-ink'

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-3.5 w-3.5 shrink-0 bg-accent" aria-hidden="true" />
      <span className="u-mono tracking-[0.24em] text-ink">Jukebox</span>
    </span>
  )
}

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="u-mono sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-[2px] focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>

      <header id="top" className="border-b border-rule">
        <div className="u-shell flex h-16 items-center justify-between gap-4">
          <a href="#top" aria-label="Jukebox, back to top">
            <Wordmark />
          </a>
          <nav className="flex items-center gap-4 sm:gap-6">
            <a href="#how" className={`${NAV_LINK} hidden sm:inline`}>
              How it works
            </a>
            <a href="#limits" className={`${NAV_LINK} hidden sm:inline`}>
              What it isn&rsquo;t
            </a>
            <a href={REPO_URL} className={NAV_LINK}>
              GitHub
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ---- hero -------------------------------------------------- */}
        <section className="u-shell pt-14 pb-16 sm:pt-20 sm:pb-16">
          <p className="u-bar u-mono text-muted">{hero.eyebrow}</p>

          <h1 className="u-display mt-1 text-[clamp(2.5rem,8.5vw,6.5rem)]">
            {hero.headline[0]}
            <br />
            {hero.headline[1]}
          </h1>

          <p className="mt-8 max-w-[44ch] text-[clamp(1.05rem,1.7vw,1.375rem)] leading-[1.5]">
            {hero.lede}
          </p>
          <p className="mt-4 max-w-[56ch] text-[0.9375rem] leading-[1.65] text-muted">
            {hero.sub}
          </p>

          <div className="mt-10 max-w-[40rem]">
            <CopyCommand />
          </div>
          <p className="u-mono mt-3.5 text-muted">{hero.sources}</p>
        </section>

        {/* ---- the ledger: signature block --------------------------- */}
        <section
          id="ledger"
          className="border-t border-rule py-16 sm:py-24"
          aria-labelledby="ledger-heading"
        >
          <div className="u-shell">
            <p className="u-bar u-mono text-muted">{ledgerCopy.eyebrow}</p>
            <h2
              id="ledger-heading"
              className="u-head mt-1 text-[clamp(1.75rem,4vw,3rem)]"
            >
              {ledgerCopy.heading}
            </h2>

            <div className="mt-10">
              <MatchLedger />
            </div>

            <p className="mt-9 max-w-[62ch] text-[1rem] leading-[1.65] text-muted">
              {ledgerCopy.caption}
            </p>
          </div>
        </section>

        {/* ---- how it works ------------------------------------------ */}
        <section
          id="how"
          className="border-t border-rule py-16 sm:py-24"
          aria-labelledby="how-heading"
        >
          <div className="u-shell">
            <p className="u-bar u-mono text-muted">
              Three concerns, deliberately separated
            </p>
            <h2
              id="how-heading"
              className="u-head mt-1 text-[clamp(1.75rem,4vw,3rem)]"
            >
              How it works
            </h2>

            <ul className="mt-10 grid gap-px border border-rule bg-rule sm:grid-cols-3">
              {concerns.map((concern) => (
                <li key={concern.name} className="bg-ground p-6">
                  <span className="u-mono text-accent-ink">{concern.where}</span>
                  <h3 className="u-head mt-3 text-[1.5rem]">{concern.name}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-[1.6] text-muted">
                    {concern.does}
                  </p>
                </li>
              ))}
            </ul>

            <p className="u-head mt-12 max-w-[20ch] text-[clamp(1.375rem,3vw,2.25rem)]">
              Bytes never pass through our infrastructure.
            </p>
            <p className="mt-4 max-w-[56ch] text-[0.9375rem] leading-[1.65] text-muted">
              The backend resolves playlists and caches matches. The CLI downloads
              straight from the catalog, so there is no bandwidth bill and hosting
              stays flat no matter how much music people pull.
            </p>

            <div className="mt-12 border-t border-rule pt-6">
              <p className="u-mono text-muted">Open catalogs</p>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {catalogs.map((catalog) => (
                  <li key={catalog} className="u-strip text-[1.0625rem]">
                    {catalog}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- what it isn't ----------------------------------------- */}
        <section
          id="limits"
          className="border-t border-rule py-16 sm:py-24"
          aria-labelledby="limits-heading"
        >
          <div className="u-shell">
            <p className="u-bar u-mono text-muted">Non-goals</p>
            <h2
              id="limits-heading"
              className="u-head mt-1 text-[clamp(1.75rem,4vw,3rem)]"
            >
              What it isn&rsquo;t
            </h2>

            <ul className="mt-10 grid gap-x-12 gap-y-9 sm:grid-cols-2">
              {nonGoals.map((item) => (
                <li key={item.claim}>
                  <h3 className="u-strip text-[1.125rem] text-ink">{item.claim}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-[1.6] text-muted">
                    {item.gloss}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule py-14">
        <div className="u-shell">
          <div className="max-w-[40rem]">
            <CopyCommand />
          </div>

          <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Wordmark />
              <p className="mt-3 text-[0.875rem] text-muted">
                Sync your playlists. Own your music.
              </p>
            </div>
            <nav className="flex gap-6">
              <a href={REPO_URL} className={NAV_LINK}>
                GitHub
              </a>
              <a
                href={`${REPO_URL}/blob/main/docs/design/DESIGN.md`}
                className={NAV_LINK}
              >
                Design
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </>
  )
}
