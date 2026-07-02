import path from 'node:path'
import type { NextConfig } from 'next'

// The api serves uploaded images from its own origin (`localhost:3001` in
// dev, the Railway domain of the api service in prod). The storefront stores
// image URLs
// as origin-agnostic `/uploads/...` paths and we proxy them through Next
// so the browser never deals with cross-origin URLs.
const apiOrigin =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001'

const nextConfig: NextConfig = {
  // Required because @ximi4ka-shop/shared ships .ts source rather than compiled JS.
  transpilePackages: ['@ximi4ka-shop/shared'],
  images: {
    // The imported Tilda catalog and blog articles still reference images on
    // Tilda's CDN (re-hosting them is a separate follow-up task) — next/image
    // throws a 500 for any un-allowlisted remote host.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.tildacdn.com',
      },
    ],
  },
  // Pin workspace root so Next doesn't pick up unrelated lockfiles higher in the tree.
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${apiOrigin}/uploads/:path*`,
      },
    ]
  },
}

export default nextConfig
