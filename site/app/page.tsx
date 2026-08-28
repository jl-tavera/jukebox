import { CopyButton } from '@/components/copy-button'
import { Donate } from '@/components/donate'
import { ThemeToggle } from '@/components/theme-toggle'
import { INSTALL_COMMAND, WORDMARK, hero } from '@/lib/content'

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-20 text-center sm:px-10">
      <div className="absolute top-5 right-5 sm:top-8 sm:right-10">
        <ThemeToggle />
      </div>

      <pre className="u-art" role="img" aria-label="Jukebox">{WORDMARK}</pre>

      <p className="mt-10 text-[clamp(1rem,2.8vw,1.625rem)] sm:mt-14">
        {hero.tagline}
      </p>

      <p className="mt-5 max-w-[62ch] text-[0.8125rem] leading-[1.75] text-dim sm:text-[0.9375rem]">
        {hero.lede}
      </p>

      <div className="mt-11 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5">
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

      <div className="mt-1.5" aria-hidden="true">
        <span className="u-cursor inline-block text-[0.6875rem] sm:text-[0.9375rem]">
          █
        </span>
      </div>

      <Donate />
    </main>
  )
}
