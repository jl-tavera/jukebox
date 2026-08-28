import type { NextConfig } from 'next'

/**
 * Static export only. The site Worker must keep serving install.sh and
 * discovery.json when api.jukebox.dev is down, so nothing here may depend
 * on a running Next.js process. See docs/design/SITE.md 01.
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
}

export default nextConfig
