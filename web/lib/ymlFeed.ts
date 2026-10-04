import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import type { PublicSettings } from './api'
import { BRAND_NAME } from './jsonLd'

// --- XML escaping ---
//
// The YML feed goes to Yandex Market's parser, which is strict about the
// five predefined XML entities. Everything that lands inside an element or
// attribute runs through this helper. Centralized so the generator has a
// single audit point for "is user content correctly escaped?".
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&apos;',
  '"': '&quot;',
}

// Управляющие символы, которых нет в XML 1.0 (кроме таба, \n и \r): с ними
// парсер Маркета отклоняет весь фид, а сущностями их не записать.
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

export function escapeXml(value: string): string {
  return value.replace(XML_INVALID_CHARS, '').replace(/[&<>'"]/g, (ch) => XML_ESCAPES[ch] ?? ch)
}

// --- Helpers shared with product feeds ---

// Strip HTML tags for the short YML <description>. Yandex accepts HTML
// inside <description> but wrapped in CDATA; we go plaintext instead to
// avoid importing a sanitizer here (the admin's long-description blocks
// already go through DOMPurify before storage).
function htmlToPlaintext(html: string): string {
  return (
    html
      // Тег начинается с буквы или «/», иначе «pH < 7 и > 3» съелось бы как тег.
      .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      // Сущности раскрываем, потому что escapeXml экранирует «&» заново;
      // «&amp;» последним, чтобы не раскрыть «&amp;lt;» дважды.
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

// Требование YML: description не длиннее 3000 символов. Режем по символам
// Unicode, чтобы не оставить половину суррогатной пары, и по границе слова,
// чтобы не оборвать описание на полуслове (слово без пробелов — режем жёстко).
const DESCRIPTION_MAX_CHARS = 3000

function truncateChars(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  const cut = chars.slice(0, max)
  if (/\s/.test(chars[max])) return cut.join('').trimEnd()
  let lastSpace = cut.length - 1
  while (lastSpace > 0 && !/\s/.test(cut[lastSpace])) lastSpace--
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).join('').trimEnd()
}

// Маркет показывает скидку, когда старая цена выше текущей минимум на 5%.
function hasOldPrice(product: Product): product is Product & { compareAtPriceRub: number } {
  const old = product.compareAtPriceRub
  return old != null && old >= product.priceRub * 1.05
}

// Служебные заголовки блоков длинного описания: под ними идут списки состава
// и характеристик, а не описание товара.
const SERVICE_HEADINGS = new Set(['состав', 'характеристики', 'комплектация'])

function isServiceHeading(text: string): boolean {
  return SERVICE_HEADINGS.has(text.replace(/[\s:.]+$/, '').toLowerCase())
}

// Текст абзаца для описания или '' — если блок не текстовый, пустой или
// относится к служебному разделу («Состав», «Характеристики»).
function paragraphText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return ''
  const { type, html } = block as { type?: string; html?: unknown }
  if (type !== 'paragraph' || typeof html !== 'string') return ''
  for (const heading of html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    if (isServiceHeading(htmlToPlaintext(heading[1]))) return ''
  }
  const text = htmlToPlaintext(html)
  return isServiceHeading(text) ? '' : text
}

// Pick the description for the YML <description> field. Priority:
//   1. shortDescription (admin-authored summary)
//   2. первый осмысленный текстовый блок длинного описания
//   3. empty string — <description> is optional in YML, so we simply skip it.
function productDescription(product: Product): string {
  const short = product.shortDescription ? htmlToPlaintext(product.shortDescription) : ''
  if (short) return short
  const blocks = Array.isArray(product.longDescriptionBlocks) ? product.longDescriptionBlocks : []
  for (const block of blocks) {
    const text = paragraphText(block)
    if (text) return text
  }
  return ''
}

// --- Date formatting ---
//
// YML expects `<yml_catalog date="YYYY-MM-DD HH:mm">`. We format in UTC so
// the feed is deterministic regardless of server timezone — Yandex just
// wants a "when was this generated" marker, not a tz-aware timestamp.
export function formatYmlDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  )
}

export type ProductWithCategoryIds = Product & { categoryIds?: string[] }

export interface YmlGeneratorInput {
  products: ProductWithCategoryIds[]
  categories: ProductCategory[]
  settings: Pick<
    PublicSettings,
    'ymlShopName' | 'ymlCompany' | 'ymlUrl' | 'ymlCurrency' | 'ymlDeliveryNote'
  >
  siteUrl: string
  /** Optional generation time — injected in tests for deterministic snapshots. */
  now?: Date
}

// Build the YML XML string. Pure function so tests can feed it fixtures and
// assert line-level. Follows the minimal spec from the task brief: shop
// metadata + currencies + categories + offers. We deliberately skip
// variants/grouped offers — not needed for the MVP. barcode, param и
// sales_notes не выводим: в модели товара и настройках сайта для них нет данных.
export function generateYmlXml(input: YmlGeneratorInput): string {
  const { products, categories, settings, siteUrl, now = new Date() } = input

  // Build a UUID → sequential integer map. YML requires integer category
  // ids; we assign them deterministically in insertion order so a given
  // catalog shape produces a stable feed across regenerations (until
  // categories are added/removed).
  const categoryIdMap = new Map<string, number>()
  categories.forEach((cat, i) => categoryIdMap.set(cat.id, i + 1))

  // Пустое значение в настройках (null, '' или пробелы) — как отсутствие.
  const shopName = settings.ymlShopName?.trim() || BRAND_NAME
  const shopCompany = settings.ymlCompany?.trim() || shopName
  const shopUrl = settings.ymlUrl ?? siteUrl
  const currency = settings.ymlCurrency ?? 'RUB'
  const deliveryNote = settings.ymlDeliveryNote?.trim()

  const categoryLines = categories
    .map((cat) => {
      const id = categoryIdMap.get(cat.id)
      const parentId =
        cat.parentId && categoryIdMap.has(cat.parentId) ? categoryIdMap.get(cat.parentId)! : null
      const parentAttr = parentId != null ? ` parentId="${parentId}"` : ''
      return `      <category id="${id}"${parentAttr}>${escapeXml(cat.name)}</category>`
    })
    .join('\n')

  const offers: string[] = []
  for (const product of products) {
    // YML requires a categoryId. Skip products with no linked category —
    // a partial feed still validates, whereas an offer missing <categoryId>
    // makes Yandex reject the whole response.
    const firstCatId = product.categoryIds?.find((id) => categoryIdMap.has(id))
    if (!firstCatId) continue
    const categoryId = categoryIdMap.get(firstCatId)!

    const available = product.stockStatus === 'in_stock' ? 'true' : 'false'
    const productUrl = product.canonicalUrl?.trim() || `${siteUrl}/product/${product.slug}`
    const description = truncateChars(productDescription(product), DESCRIPTION_MAX_CHARS)
    const vendorCode = product.sku?.trim()

    // Cap at 10 pictures per the YML spec so the feed stays compliant even
    // for products with large galleries.
    const pictureLines = (product.images ?? [])
      .slice(0, 10)
      // Маркет принимает только абсолютные адреса картинок.
      .map((img) => {
        const url = /^https?:\/\//i.test(img.url)
          ? img.url
          : `${siteUrl}${img.url.startsWith('/') ? '' : '/'}${img.url}`
        return `      <picture>${escapeXml(url)}</picture>`
      })
      .join('\n')

    const offerLines = [
      `    <offer id="${escapeXml(product.id)}" available="${available}">`,
      `      <url>${escapeXml(productUrl)}</url>`,
      `      <price>${product.priceRub}</price>`,
      hasOldPrice(product) ? `      <oldprice>${product.compareAtPriceRub}</oldprice>` : '',
      `      <currencyId>${escapeXml(currency)}</currencyId>`,
      `      <categoryId>${categoryId}</categoryId>`,
      pictureLines,
      `      <name>${escapeXml(product.name)}</name>`,
      `      <vendor>${escapeXml(BRAND_NAME)}</vendor>`,
      vendorCode ? `      <vendorCode>${escapeXml(vendorCode)}</vendorCode>` : '',
      description ? `      <description>${escapeXml(description)}</description>` : '',
    ]
      .filter(Boolean)
      .join('\n')
    offers.push(`${offerLines}\n    </offer>`)
  }

  // The shop block is assembled line-by-line rather than with a template
  // library because the tree is small and dependencies cost more than they
  // save here. Tests assert on the resulting string directly.
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE yml_catalog SYSTEM "shops.dtd">`,
    `<yml_catalog date="${formatYmlDate(now)}">`,
    `  <shop>`,
    `    <name>${escapeXml(shopName)}</name>`,
    `    <company>${escapeXml(shopCompany)}</company>`,
    `    <url>${escapeXml(shopUrl)}</url>`,
    `    <currencies>`,
    `      <currency id="${escapeXml(currency)}" rate="1"/>`,
    `    </currencies>`,
    `    <categories>`,
    categoryLines,
    `    </categories>`,
    deliveryNote
      ? `    <delivery-options>\n      <option cost="0" days="3-7" description="${escapeXml(deliveryNote)}"/>\n    </delivery-options>`
      : '',
    `    <offers>`,
    offers.join('\n'),
    `    </offers>`,
    `  </shop>`,
    `</yml_catalog>`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}
