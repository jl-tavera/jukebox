import { Screen } from '@/components/screen'
import { CLI_VERSION } from '@/lib/content'
import { finished } from '@/lib/session'

/**
 * The landing page is a terminal.
 *
 * It computes the session and renders it, and that is the whole of the file --
 * ADR-0010's shape, which is `cli/src/main.ts`'s: compute, then render, with
 * one renderer and nothing else writing.
 *
 * The session is finished rather than playing. #84 clears it on load and
 * replays it as typing, over this as the floor; a visitor with no JavaScript,
 * with reduced motion, or reading with a screen reader gets what is here.
 */
export default function Home() {
  return <Screen session={finished(CLI_VERSION)} />
}
