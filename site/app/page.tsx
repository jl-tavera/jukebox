import { Live } from '@/components/live'

/**
 * The page, which is a shell.
 *
 * **Nothing is computed here any more, and that is the change #112 made.** This
 * used to hand `Live` a finished session computed on the build machine, so that
 * the served HTML carried the whole first screen and a visitor with no
 * JavaScript still met a page. A terminal emulator needs WebAssembly and real
 * text measurement, and a build machine has neither -- so the session is built
 * in the browser now, and the served-HTML floor is gone.
 *
 * #114 records that as one of the costs rather than leaving it to be noticed:
 * ADR-0010 named the served session as one of three things replacing the
 * guaranteed one-line install handover it gave up, and this leaves two.
 */
export default function Home() {
  return <Live />
}
