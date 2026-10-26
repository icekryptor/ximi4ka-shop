import path from 'node:path'
import type { NextConfig } from 'next'

// The api serves uploaded images from its own origin (`localhost:3001` in dev,
// the api container on the VPS in prod). The storefront stores image URLs as
// origin-agnostic `/uploads/...` paths and we proxy them through Next so the
// browser never deals with cross-origin URLs. The rewrite runs server-side, so
// it prefers API_URL (docker-network address) over the public origin.
const apiOrigin =
  (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, '') ??
  'http://localhost:3001'

const nextConfig: NextConfig = {
  // Self-hosted on our own VPS: `standalone` emits a minimal server bundle with
  // only the traced node_modules, which is what web/Dockerfile ships.
  output: 'standalone',
  // Compression is Caddy's job (`encode zstd gzip` in deploy/Caddyfile*.snippet).
  // Next's built-in gzip flushes streamed HTML with Z_FULL_FLUSH, resetting the
  // dictionary on every chunk: the home page went out as 57 KB of gzip instead
  // of 37 KB of zstd from Caddy, and Caddy passes already-encoded responses
  // through untouched. Running without Caddy means uncompressed responses.
  compress: false,
  // Required because @ximi4ka-shop/shared ships .ts source rather than compiled JS.
  transpilePackages: ['@ximi4ka-shop/shared'],
  images: {
    // Next 16 принимает только перечисленные quality. 75 — по умолчанию, 65 — у фото
    // карточек товаров (components/ProductCard.tsx).
    qualities: [65, 75],
    // Transition period: until `migrate:tilda-images -w api --apply` has run on
    // the server (and while some admin-edited content may still point at
    // Tilda's CDN), next/image throws a 500 for any un-allowlisted remote host.
    // Drop this pattern once no tildacdn URL is left in the database.
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
