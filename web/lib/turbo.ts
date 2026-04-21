import type { Page, Product } from '@ximi4ka-shop/shared'
import { escapeXml } from './ymlFeed'

// Yandex Turbo RSS. One <item> per published product and one per published
// CMS page. The Turbo-page HTML fragment sits inside <turbo:content> CDATA.
// Yandex accepts a small tag vocabulary there — <header>, <h1>, <p>,
// <strong>, <em>, <details>, <summary>. We deliberately stick to that
// subset; richer components (carousels, forms, embeds) would require
// additional Turbo tags and namespaces.

interface TurboInput {
  products: Product[]
  pages: Page[]
  siteUrl: string
  channel?: {
    title?: string
    description?: string
    language?: string
  }
}

function formatRubForTurbo(priceRub: number): string {
  // Russian-style spaces as thousand separators; \u00A0 (NBSP) keeps the
  // number atomic when Turbo renders inside narrow columns.
  return priceRub.toLocaleString('ru-RU').replace(/,/g, '\u00A0')
}

function htmlToPlaintext(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Render the Turbo-HTML body for a product item. <header> frames the title
// for Yandex's rich display; price goes in the lead paragraph so it's
// visible above the fold; description paragraphs trail.
function productTurboContent(product: Product): string {
  const price = `${formatRubForTurbo(product.priceRub)} ₽`
  const description = product.shortDescription?.trim() ?? ''
  const longParas: string[] = []
  const blocks = Array.isArray(product.longDescriptionBlocks)
    ? product.longDescriptionBlocks
    : []
  for (const block of blocks) {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: string }).type === 'paragraph'
    ) {
      const text = htmlToPlaintext((block as { html?: string }).html ?? '')
      if (text) longParas.push(`<p>${escapeXml(text)}</p>`)
    }
  }
  const parts = [
    `<header><h1>${escapeXml(product.name)}</h1></header>`,
    `<p><strong>${escapeXml(price)}</strong></p>`,
    description ? `<p>${escapeXml(description)}</p>` : '',
    ...longParas,
  ]
  return parts.filter(Boolean).join('\n')
}

// Render the Turbo-HTML body for a CMS page. We flatten paragraph + FAQ
// blocks only; video, layout, gallery etc. need richer Turbo markup and
// are deliberately skipped (SEO preview > pixel-perfect parity).
function pageTurboContent(page: Page): string {
  const blocks = Array.isArray(page.blocks) ? page.blocks : []
  const lines: string[] = [`<header><h1>${escapeXml(page.title)}</h1></header>`]
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const type = (block as { type?: string }).type
    if (type === 'paragraph') {
      const html = (block as { html?: string }).html ?? ''
      const text = htmlToPlaintext(html)
      if (text) lines.push(`<p>${escapeXml(text)}</p>`)
    } else if (type === 'faq') {
      const items = (block as { items?: Array<{ question: string; answer: string }> })
        .items ?? []
      for (const item of items) {
        lines.push(
          `<details><summary>${escapeXml(item.question)}</summary><p>${escapeXml(item.answer)}</p></details>`,
        )
      }
    }
  }
  return lines.join('\n')
}

// Build an RFC 822 date for RSS. Turbo's RSS 2.0 profile prefers this
// format; fallback to Date.toUTCString() which is already RFC 822.
function rfc822(date: Date): string {
  return date.toUTCString()
}

export function generateTurboRss(input: TurboInput): string {
  const {
    products,
    pages,
    siteUrl,
    channel = {
      title: 'Ximi4ka',
      description: 'Наборы для химических экспериментов',
      language: 'ru',
    },
  } = input

  const items: string[] = []

  for (const product of products) {
    const url = `${siteUrl}/product/${product.slug}`
    const pubDate = rfc822(new Date(product.updatedAt))
    items.push(
      [
        `    <item turbo="true">`,
        `      <link>${escapeXml(url)}</link>`,
        `      <title>${escapeXml(product.name)}</title>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <turbo:content><![CDATA[`,
        productTurboContent(product),
        `      ]]></turbo:content>`,
        `    </item>`,
      ].join('\n'),
    )
  }

  for (const page of pages) {
    // Skip the home slug — rendered at `/`, not `/home`. Mirrors the
    // sitemap's omission so both surfaces stay in sync.
    if (page.slug === 'home') continue
    const url = `${siteUrl}/${page.slug}`
    const pubDate = rfc822(new Date(page.updatedAt))
    items.push(
      [
        `    <item turbo="true">`,
        `      <link>${escapeXml(url)}</link>`,
        `      <title>${escapeXml(page.title)}</title>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <turbo:content><![CDATA[`,
        pageTurboContent(page),
        `      ]]></turbo:content>`,
        `    </item>`,
      ].join('\n'),
    )
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:yandex="http://news.yandex.ru" xmlns:turbo="http://turbo.yandex.ru">`,
    `  <channel>`,
    `    <title>${escapeXml(channel.title ?? 'Ximi4ka')}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(channel.description ?? '')}</description>`,
    `    <language>${escapeXml(channel.language ?? 'ru')}</language>`,
    items.join('\n'),
    `  </channel>`,
    `</rss>`,
  ].join('\n')
}
