import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { siteUrl } from '@/lib/metadata'

// Serve admin-edited robots.txt at the site root. Crawlers fetch /robots.txt
// directly (no /api prefix, no JSON envelope), so we proxy the plain-text
// endpoint on the API. Revalidated every 5 minutes — short enough that an
// admin edit propagates quickly, long enough that burst crawling doesn't hit
// the DB on every request.
// Фид строится из каталога, а сборка образа идёт без доступа к api: с
// пререндером в образ попал бы пустой фид и отдавался бы до истечения окна
// revalidate. Рендерим по запросу — фид дёргают краулеры, это недорого.
export const dynamic = 'force-dynamic'

// Safe fallback used if the API is unreachable. Keeps crawlers happy (returns
// 200 with a permissive default) rather than serving a 5xx that some bots
// interpret as "all disallowed".
// Sitemap — абсолютным адресом, как требует протокол.
const FALLBACK = `User-agent: *\nAllow: /\nSitemap: ${siteUrl()}/sitemap.xml\n`

// Сайт закрыт целиком, если для `User-agent: *` есть `Disallow: /` без пути.
// Группа — подряд идущие User-agent и следующие за ними правила.
function isClosedForAll(text: string): boolean {
  let starGroup = false
  let afterAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!m) continue
    const field = m[1].toLowerCase()
    const value = m[2].trim()
    if (field === 'user-agent') {
      starGroup = afterAgent ? starGroup || value === '*' : value === '*'
      afterAgent = true
      continue
    }
    afterAgent = false
    if (starGroup && field === 'disallow' && value === '/') return true
  }
  return false
}

// robots.txt редактируется в админке и Sitemap в нём могут забыть. Дописываем
// его, если сайт открыт и своей строки Sitemap нет; закрытый режим не трогаем —
// карта сайта в нём не нужна.
function withSitemap(text: string): string {
  if (/^\s*sitemap\s*:/im.test(text) || isClosedForAll(text)) return text
  const sep = text === '' || text.endsWith('\n') ? '' : '\n'
  return `${text}${sep}Sitemap: ${siteUrl()}/sitemap.xml\n`
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${ADMIN_API_URL_SERVER}/api/public/settings/robots.txt`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      return new Response(FALLBACK, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    const text = withSitemap(await res.text())
    return new Response(text, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return new Response(FALLBACK, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}
