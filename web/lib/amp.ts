import type { Page, Product } from '@ximi4ka-shop/shared'
import { escapeXml } from './ymlFeed'

// AMP (Accelerated Mobile Pages) HTML generation.
//
// Strategy: pure string templating. Server components would fight the
// strict AMP document shape (Next injects runtime chunks, hydration
// markers, etc.), so we opt out entirely and emit a hand-authored document
// from the Route Handler. The trade-off: no Tailwind, no shared React
// components. That's fine — AMP pages exist for search/discover previews,
// not rich browsing.
//
// Constraints encoded here:
//   * <html amp lang="ru">
//   * <meta charset="utf-8">, <meta name="viewport" content="width=device-width">
//   * <link rel="canonical" href="...">
//   * Exactly one <style amp-custom> block (max 75KB)
//   * Mandatory AMP boilerplate <style amp-boilerplate> + <noscript>
//   * <script async src="https://cdn.ampproject.org/v0.js">
//   * No other <script> tags (other than application/ld+json)
//   * No inline styles; all styling via amp-custom
//   * <amp-img> instead of <img>, with width/height
//
// The validator test (amp.test.ts) catches drift from these rules.

const AMP_RUNTIME_SCRIPT =
  '<script async src="https://cdn.ampproject.org/v0.js"></script>'

// Mandatory AMP boilerplate — copied verbatim from the spec. Do not edit;
// any single-character drift will cause the validator to reject the doc.
const AMP_BOILERPLATE = `<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>`

// Minimal brand-tuned amp-custom. Inlined because AMP forbids external
// stylesheets. Keep this SHORT — we have 75KB but brevity aids audit.
const AMP_CUSTOM_CSS = `body{font-family:Arial,sans-serif;color:#1c1528;background:#fff;margin:0;line-height:1.5}
.container{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:28px;line-height:1.2;margin:0 0 12px}
h2{font-size:20px;margin:24px 0 8px}
p{margin:0 0 12px}
a{color:#6703ff;text-decoration:none}
a:hover{text-decoration:underline}
.price{font-size:24px;font-weight:bold;color:#1c1528;margin:12px 0}
.price del{color:#999;font-weight:normal;margin-left:8px}
.stock{font-size:14px;color:#524667;margin:0 0 12px}
.gallery{margin:12px 0}
.gallery amp-img{margin-bottom:8px;border-radius:12px;overflow:hidden}
.breadcrumbs{font-size:13px;color:#524667;margin:0 0 16px}
.breadcrumbs a{color:#524667}`

function ampImg(opts: {
  src: string
  alt: string
  width?: number
  height?: number
  layout?: string
}): string {
  const width = opts.width ?? 720
  const height = opts.height ?? 720
  const layout = opts.layout ?? 'responsive'
  return `<amp-img src="${escapeXml(opts.src)}" alt="${escapeXml(opts.alt)}" width="${width}" height="${height}" layout="${layout}"></amp-img>`
}

// Block → AMP-safe HTML. Only paragraph, faq, and image are lifted;
// video/layout/cta/gallery/product_grid are deliberately skipped — they
// need additional AMP extensions (<amp-youtube>, forms) that we're not
// wiring up in this phase.
function blockToAmp(block: unknown): string {
  if (typeof block !== 'object' || block === null) return ''
  const b = block as { type?: string }
  if (b.type === 'paragraph') {
    const html = (block as { html?: string }).html ?? ''
    // Strip to plaintext then re-escape — trusting admin-supplied HTML
    // here would risk smuggling <script> or unsupported AMP tags.
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text ? `<p>${escapeXml(text)}</p>` : ''
  }
  if (b.type === 'faq') {
    const items =
      (block as { items?: Array<{ question: string; answer: string }> }).items ??
      []
    return items
      .map(
        (it) =>
          `<h2>${escapeXml(it.question)}</h2>\n<p>${escapeXml(it.answer)}</p>`,
      )
      .join('\n')
  }
  if (b.type === 'image') {
    const img = block as { url?: string; alt?: string; width?: number; height?: number }
    if (!img.url) return ''
    return ampImg({
      src: img.url,
      alt: img.alt ?? '',
      width: img.width ?? 720,
      height: img.height ?? 480,
    })
  }
  return ''
}

function formatRubForAmp(priceRub: number): string {
  return priceRub.toLocaleString('ru-RU').replace(/,/g, '\u00A0')
}

function stockLabelRu(status: Product['stockStatus']): string {
  if (status === 'in_stock') return 'В наличии'
  if (status === 'out_of_stock') return 'Нет в наличии'
  return 'Под заказ'
}

interface AmpRenderBase {
  title: string
  canonical: string
  description?: string | null
  /** Optional JSON-LD block — embedded as <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown>
}

function wrapAmpDocument(opts: AmpRenderBase, body: string): string {
  const descMeta = opts.description
    ? `<meta name="description" content="${escapeXml(opts.description)}">`
    : ''
  const jsonLd = opts.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`
    : ''
  return `<!doctype html>
<html amp lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeXml(opts.title)}</title>
<link rel="canonical" href="${escapeXml(opts.canonical)}">
<meta name="viewport" content="width=device-width">
${descMeta}
${AMP_BOILERPLATE}
${AMP_RUNTIME_SCRIPT}
<style amp-custom>${AMP_CUSTOM_CSS}</style>
${jsonLd}
</head>
<body>
<div class="container">
${body}
</div>
</body>
</html>`
}

// --- Public renderers ---

export function renderAmpProduct(product: Product, siteUrl: string): string {
  const canonical = `${siteUrl}/product/${product.slug}`
  const gallery = (product.images ?? [])
    .slice(0, 10)
    .map((img) =>
      ampImg({ src: img.url, alt: img.alt, width: 720, height: 720 }),
    )
    .join('\n')
  const blocks = Array.isArray(product.longDescriptionBlocks)
    ? product.longDescriptionBlocks.map(blockToAmp).filter(Boolean).join('\n')
    : ''
  const compare = product.compareAtPriceRub
    ? `<del>${escapeXml(formatRubForAmp(product.compareAtPriceRub))} ₽</del>`
    : ''

  const body = [
    `<nav class="breadcrumbs"><a href="${escapeXml(siteUrl)}/">Главная</a> / <a href="${escapeXml(siteUrl)}/categories">Каталог</a></nav>`,
    `<h1>${escapeXml(product.name)}</h1>`,
    `<p class="stock">${escapeXml(stockLabelRu(product.stockStatus))}</p>`,
    gallery ? `<div class="gallery">${gallery}</div>` : '',
    `<div class="price">${escapeXml(formatRubForAmp(product.priceRub))} ₽ ${compare}</div>`,
    product.shortDescription
      ? `<p>${escapeXml(product.shortDescription)}</p>`
      : '',
    blocks ? `<div>${blocks}</div>` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return wrapAmpDocument(
    {
      title: product.metaTitle?.trim() || product.name,
      canonical,
      description: product.metaDescription ?? product.shortDescription,
    },
    body,
  )
}

export function renderAmpArticle(page: Page, siteUrl: string): string {
  const canonical = `${siteUrl}/${page.slug}`
  const blocks = Array.isArray(page.blocks)
    ? page.blocks.map(blockToAmp).filter(Boolean).join('\n')
    : ''
  const body = [
    `<nav class="breadcrumbs"><a href="${escapeXml(siteUrl)}/">Главная</a></nav>`,
    `<h1>${escapeXml(page.title)}</h1>`,
    blocks,
  ]
    .filter(Boolean)
    .join('\n')

  return wrapAmpDocument(
    {
      title: page.metaTitle?.trim() || page.title,
      canonical,
      description: page.metaDescription,
    },
    body,
  )
}
