import { Live } from '@/components/live'
import { CLI_VERSION } from '@/lib/content'
import { finished } from '@/lib/session'

/**
 * The finished session is computed here, on the build machine, and handed
 * across the client boundary as data. That is what keeps it in the served HTML:
 * `Live` is prerendered by the static export, so its first render is the same
 * rows a crawler and a visitor with no JavaScript get. `e2e/served.spec.ts`
 * holds that, and `components/screen.tsx` explains why it has to.
 */
export default function Home() {
  return <Live initial={finished(CLI_VERSION)} />
}
