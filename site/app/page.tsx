import { CopyButton } from '@/components/copy-button'
import { Donate } from '@/components/donate'
import { ThemeToggle } from '@/components/theme-toggle'
import { INSTALL_COMMANDS, WORDMARK, hero } from '@/lib/content'

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-20 text-center sm:px-10">
      <div className="absolute top-5 right-5 sm:top-8 sm:right-10">
        <ThemeToggle />
      </div>

      {/* The banner opens with a blank row, which #68 added for the CLI: its
          header is pinned to the top of a terminal and the art sat flush
          against the edge. Nothing here needs it -- this page centres the mark
          in the viewport already -- and a browser drops a newline immediately
          after a `<pre>` start tag, so it would not show even if it were
          wanted. It is dropped rather than left because this is a static
          export: the served HTML would lose it while React's render kept it,
          which is a hydration mismatch waiting to be reported as a bug. */}
      <pre className="u-art" role="img" aria-label="Jukebox">{WORDMARK.replace(/^\n/, '')}</pre>

      <p className="mt-10 text-[clamp(1rem,2.8vw,1.625rem)] sm:mt-14">
        {hero.tagline}
      </p>

      <p className="mt-5 max-w-[62ch] text-[0.8125rem] leading-[1.75] text-dim sm:text-[0.9375rem]">
        {hero.lede}
      </p>

      {/*
        Both installers, rather than the POSIX one with Windows sent to the
        README. Windows is this project's primary environment and the reason
        the two ship together; a page handing over only the `curl` line would
        exclude the visitor most likely to be reading it. See SITE.md 01 -- the
        page's first job is handing over the install command, and for half the
        audience that is this second row.
      */}
      <div className="mt-11 flex flex-col gap-7">
        {INSTALL_COMMANDS.map(({ platforms, prompt, command }) => (
          <div key={platforms} className="flex flex-col gap-1.5">
            <p className="text-dim text-[0.625rem] tracking-[0.2em] uppercase sm:text-[0.6875rem]">
              {platforms}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5">
              <code className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap text-[0.6875rem] sm:text-[0.9375rem]">
                <span className="text-dim select-none" aria-hidden="true">
                  {prompt}{' '}
                </span>
                {command}
              </code>
              <CopyButton
                value={command}
                what={`${platforms} install command`}
                className="self-center text-[0.75rem] sm:self-auto sm:text-[0.8125rem]"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5" aria-hidden="true">
        <span className="u-cursor inline-block text-[0.6875rem] sm:text-[0.9375rem]">
          █
        </span>
      </div>

      <Donate />
    </main>
  )
}
