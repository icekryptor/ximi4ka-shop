import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { listBlogPosts, listCategories, listPages, listPublishedProducts } from '@/lib/api'
import { LLMS_MAX_POSTS, LLMS_MAX_PRODUCTS, generateLlmsTxt } from '@/lib/llmsTxt'
import { siteUrl } from '@/lib/metadata'

// Serve llms.txt at the site root. Текст, заданный в админке, отдаём как есть;
// если он пустой (так в БД по умолчанию) — собираем файл из каталога, блога и
// CMS-страниц по формату llmstxt.org.
// Файл строится из каталога, а сборка образа идёт без доступа к api: с
// пререндером в образ попал бы пустой файл и отдавался бы до истечения окна
// revalidate. Рендерим по запросу — файл дёргают краулеры, это недорого.
export const dynamic = 'force-dynamic'

// noindex: сам файл не должен попадать в поисковую выдачу, но читаться
// моделями и краулерами можно.
function textResponse(body: string, maxAgeSeconds: number): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
    },
  })
}

async function fetchManualText(): Promise<string | null> {
  try {
    const res = await fetch(`${ADMIN_API_URL_SERVER}/api/public/settings/llms.txt`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function GET(): Promise<Response> {
  const manual = await fetchManualText()
  if (manual != null && manual.trim() !== '') return textResponse(manual, 300)

  // Любой сбой раздела превращается в пустой раздел: отдаём то, что удалось
  // загрузить, но кэшируем ненадолго, чтобы файл скоро перестроился целиком.
  let degraded = manual == null
  const safe = <T>(request: Promise<{ data: T[] }>): Promise<T[]> =>
    request.then(
      (r) => r.data,
      () => {
        degraded = true
        return []
      },
    )

  const [categories, products, pages, posts] = await Promise.all([
    safe(listCategories({ limit: 100 })),
    safe(listPublishedProducts({ limit: LLMS_MAX_PRODUCTS })),
    safe(listPages({ limit: 1000 })),
    safe(listBlogPosts({ limit: LLMS_MAX_POSTS })),
  ])

  const body = generateLlmsTxt({ siteUrl: siteUrl(), categories, products, pages, posts })
  return textResponse(body, degraded ? 60 : 3600)
}
