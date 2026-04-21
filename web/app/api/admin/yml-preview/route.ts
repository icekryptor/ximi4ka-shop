import { cookies } from 'next/headers'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import {
  getPublicSettings,
  listCategories,
  listPublishedProducts,
  type ProductWithCategories,
} from '@/lib/api'
import { siteUrl } from '@/lib/metadata'
import { generateYmlXml } from '@/lib/ymlFeed'

// Admin-only "Preview YML" endpoint. Serves exactly the same XML as
// /yml.xml but:
//   1. Bypasses the ISR cache so the admin sees fresh output right after
//      tweaking settings.
//   2. Is gated on a valid admin session — the endpoint isn't secret (the
//      feed itself is public), but scoping it under /api/admin keeps the
//      mental model consistent and avoids accidental reuse of the preview
//      URL in places where stale-by-seconds matters.
export const dynamic = 'force-dynamic'

async function isAuthenticatedAdmin(cookieHeader: string): Promise<boolean> {
  if (!cookieHeader) return false
  try {
    const res = await fetch(`${ADMIN_API_URL_SERVER}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(): Promise<Response> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const authed = await isAuthenticatedAdmin(cookieHeader)
  if (!authed) {
    return new Response(
      JSON.stringify({ error: { code: 'auth_required', message: 'Authentication required' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }

  const [productsResp, categoriesResp, settings] = await Promise.all([
    listPublishedProducts({ limit: 5000, include: 'categories' }),
    listCategories({ limit: 500 }),
    getPublicSettings(),
  ])

  const xml = generateYmlXml({
    products: productsResp.data as ProductWithCategories[],
    categories: categoriesResp.data,
    settings,
    siteUrl: siteUrl(),
  })

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
