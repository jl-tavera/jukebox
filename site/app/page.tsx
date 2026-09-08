import { Live } from '@/components/live'
import { published } from '@/lib/published'

/**
 * The page, which is a shell.
 *
 * **#112 emptied this file and #113 gives it one job back.** It used to hand
 * `Live` a finished session computed on the build machine, so that the served
 * HTML carried the whole first screen and a visitor with no JavaScript still
 * met a page. A terminal emulator needs WebAssembly and real text measurement,
 * and a build machine has neither, so the session is built in the browser now
 * and the served-HTML floor is gone. #114 records that as one of the costs
 * rather than leaving it to be noticed: ADR-0010 named the served session as
 * one of three things replacing the guaranteed one-line install handover it
 * gave up, and this leaves two.
 *
 * What comes back is not that. `published()` reads both installers, the
 * discovery document and the README off disk **at prerender**, so the shell can
 * hand a visitor the exact bytes the site serves rather than a transcription of
 * them. It is a build-time read in a static export -- no runtime, no route
 * handler, and nothing here that needs a server. This is the only file that
 * imports it, because it is the only one that runs where a filesystem exists.
 */
export default function Home() {
  return <Live published={published()} />
}
