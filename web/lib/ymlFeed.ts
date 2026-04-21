import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import type { PublicSettings } from './api'

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

export function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (ch) => XML_ESCAPES[ch] ?? ch)
}

// --- Helpers shared with product feeds ---

// Strip HTML tags for the short YML <description>. Yandex accepts HTML
// inside <description> but wrapped in CDATA; we go plaintext instead to
// avoid importing a sanitizer here (the admin's long-description blocks
// already go through DOMPurify before storage).
function htmlToPlaintext(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Pick the description for the YML <description> field. Priority:
//   1. shortDescription (admin-authored summary)
//   2. first paragraph block's plaintext
//   3. empty string — <description> is optional in YML, so we simply skip it.
function productDescription(product: Product): string {
  const short = product.shortDescription?.trim()
  if (short) return short
  const blocks = Array.isArray(product.longDescriptionBlocks)
    ? product.longDescriptionBlocks
    : []
  for (const block of blocks) {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: string }).type === 'paragraph' &&
      typeof (block as { html?: unknown }).html === 'string'
    ) {
      const text = htmlToPlaintext((block as { html: string }).html)
      if (text) return text
    }
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
// variants/grouped offers/vendor codes — not needed for the MVP.
export function generateYmlXml(input: YmlGeneratorInput): string {
  const {
    products,
    categories,
    settings,
    siteUrl,
    now = new Date(),
  } = input

  // Build a UUID → sequential integer map. YML requires integer category
  // ids; we assign them deterministically in insertion order so a given
  // catalog shape produces a stable feed across regenerations (until
  // categories are added/removed).
  const categoryIdMap = new Map<string, number>()
  categories.forEach((cat, i) => categoryIdMap.set(cat.id, i + 1))

  const shopName = settings.ymlShopName ?? 'Ximi4ka'
  const shopCompany = settings.ymlCompany ?? shopName
  const shopUrl = settings.ymlUrl ?? siteUrl
  const currency = settings.ymlCurrency ?? 'RUB'
  const deliveryNote = settings.ymlDeliveryNote?.trim()

  const categoryLines = categories
    .map((cat) => {
      const id = categoryIdMap.get(cat.id)
      const parentId =
        cat.parentId && categoryIdMap.has(cat.parentId)
          ? categoryIdMap.get(cat.parentId)!
          : null
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
    const productUrl =
      product.canonicalUrl?.trim() || `${siteUrl}/product/${product.slug}`
    const description = productDescription(product)

    // Cap at 10 pictures per the YML spec so the feed stays compliant even
    // for products with large galleries.
    const pictureLines = (product.images ?? [])
      .slice(0, 10)
      .map((img) => `      <picture>${escapeXml(img.url)}</picture>`)
      .join('\n')

    const offerLines = [
      `    <offer id="${escapeXml(product.id)}" available="${available}">`,
      `      <url>${escapeXml(productUrl)}</url>`,
      `      <price>${product.priceRub}</price>`,
      `      <currencyId>${escapeXml(currency)}</currencyId>`,
      `      <categoryId>${categoryId}</categoryId>`,
      pictureLines,
      `      <name>${escapeXml(product.name)}</name>`,
      description
        ? `      <description>${escapeXml(description)}</description>`
        : '',
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
