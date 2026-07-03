// Helpers for importing the real Tilda catalog from a crawl of ximi4ka.ru
// (products.tsv + saved product-page HTML). Pure parsing lives here so it is
// unit-testable; DB writes live in ../import-tilda-catalog.ts.
import { sanitizeHtml } from './sanitize-html.js'
import type { ParagraphBlock } from './tilda-row.js'

// Target category tree for the new shop. Slugs are load-bearing: they become
// public URLs (/categories/{slug}) and the redirect map for the old site.
export const CATALOG_CATEGORIES = [
  { slug: 'kits', name: 'Наборы' },
  { slug: 'combo', name: 'Комбо' },
  { slug: 'reagents', name: 'Реактивы' },
  { slug: 'equipment', name: 'Лабораторное оборудование' },
  { slug: 'print', name: 'Печатная продукция' },
] as const

export type CatalogCategorySlug = (typeof CATALOG_CATEGORIES)[number]['slug']

// Manual slug fixes keyed by Tilda numeric product id:
// - two products share the Tilda slug "hlorid-kaltsiya" (powder vs solution);
// - Tilda truncated "tablitsa-mendeleeva-i-tablitsa-rastvorimosti" mid-word.
export const SLUG_OVERRIDES: Record<string, string> = {
  '931658942912': 'hlorid-kaltsiya-poroshok',
  '330530345672': 'hlorid-kaltsiya-rastvor',
  '792180934872': 'tablitsa-mendeleeva-i-rastvorimosti',
}

// Products whose Tilda URLs have no /catalog/<cat>/ prefix are either base
// kits or combo bundles. The combo set is taken from the /catalog/combo page
// of the crawl, which lists exactly these three cards ("Запас всех реактивов"
// is shown there as «Мнооооого реактивов», id 108150144542).
export const COMBO_SLUGS: ReadonlySet<string> = new Set([
  'himichka-i-elektrohimichka',
  'vse-tri-nabora',
  'zapas-vseh-reaktivov',
])

// Old-site catalog path segment → new category slug.
const URL_CATEGORY_TO_SLUG: Record<string, CatalogCategorySlug> = {
  kits: 'kits',
  combo: 'combo',
  reagents: 'reagents',
  equipment: 'equipment',
  print: 'print',
}

export interface TproductRef {
  /** Tilda numeric product id, e.g. "279167718312". */
  tildaId: string
  /** Latin slug after the id, e.g. "himichka-30". */
  slug: string
}

// Tilda product URLs look like
//   https://ximi4ka.ru[/catalog/<cat>]/tproduct/<numeric-id>-<slug>
export function parseTproductUrl(url: string): TproductRef | null {
  const m = /\/tproduct\/(\d+)-([a-z0-9-]+)\/?$/.exec(url.trim())
  if (!m) return null
  return { tildaId: m[1]!, slug: m[2]! }
}

export function resolveProductSlug(ref: TproductRef): string {
  return SLUG_OVERRIDES[ref.tildaId] ?? ref.slug
}

// Category from the URL path when present; otherwise combo/kits by slug.
export function resolveCategorySlug(url: string, slug: string): CatalogCategorySlug {
  const m = /\/catalog\/([a-z0-9_-]+)\/tproduct\//.exec(url)
  if (m) {
    const mapped = URL_CATEGORY_TO_SLUG[m[1]!]
    if (!mapped) throw new Error(`unknown catalog category in URL: ${url}`)
    return mapped
  }
  return COMBO_SLUGS.has(slug) ? 'combo' : 'kits'
}

export interface TsvProductRow {
  url: string
  name: string
  priceRub: number
  stockRaw: string
}

// products.tsv columns: url, name, price, compare-at (always empty in the
// crawl), stock status, truncated og:description. We only keep what the
// import uses; descriptions come from the full page HTML instead.
export function parseProductsTsv(text: string): TsvProductRow[] {
  const rows: TsvProductRow[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    const [url, name, priceRaw, , stockRaw] = cols
    if (!url || !name) throw new Error(`products.tsv: malformed row: ${line.slice(0, 120)}`)
    const price = Number((priceRaw ?? '').trim())
    if (!Number.isFinite(price)) {
      throw new Error(`products.tsv: unparseable price "${priceRaw}" for ${url}`)
    }
    rows.push({
      url: url.trim(),
      name: name.trim(),
      priceRub: Math.round(price),
      stockRaw: (stockRaw ?? '').trim(),
    })
  }
  return rows
}

// Prices in the embedded product JSON come in several shapes: "3500",
// "3 500.00", "3500,00". Zero/empty means "no price" (used for compare-at).
export function parseTildaPrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const normalized = String(raw).replace(/\s+/g, '').replace(',', '.')
  if (!normalized) return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

export interface TildaProductJson {
  uid: number
  title?: string
  descr?: string | null
  text?: string | null
  sku?: string | null
  price?: string
  priceold?: string | null
  gallery?: Array<{ img: string }>
}

// Every crawled product page embeds `var product = {...};` — a full product
// object (description, old price, gallery). It is the only place the crawl
// has gallery images and strikethrough prices in machine-readable form.
export function extractProductJson(html: string): TildaProductJson | null {
  const m = /var product = (\{.*?\});\s*\n/s.exec(html)
  if (!m) return null
  try {
    return JSON.parse(m[1]!) as TildaProductJson
  } catch {
    return null
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function extractOgDescription(html: string): string | null {
  const m = /<meta property="og:description" content="([^"]*)"/.exec(html)
  if (!m) return null
  const decoded = decodeHtmlEntities(m[1]!).trim()
  return decoded === '' ? null : decoded
}

// Reagent (and a few equipment) product names on Tilda are SEO H1 strings of
// the shape `Купить <товар> | <синонимы для опытов>` — great for search, ugly
// on a card, in the cart, and in an order line. Split that into a clean display
// name and keep the full original as the SEO `metaTitle`.
//
//   in : "Купить серную кислоту 7%, 65 мл | Раствор серной кислоты для опытов"
//   out: { name: "Серная кислота 7%, 65 мл",
//          metaTitle: "Купить серную кислоту 7%, 65 мл | …" }
//
// Names without the `Купить … | …` pattern (kits, most equipment) pass through
// unchanged with metaTitle=null.
//
// A handful of names lead with an accusative noun (because "Купить" governs the
// accusative). We nominativise just those leading heads so the card reads like a
// title, not a shopping-list line.
// `\b` is unreliable next to Cyrillic (не в \w), so anchor the tail on a space
// or end-of-string with a lookahead instead.
const ACCUSATIVE_HEADS: Array<[RegExp, string]> = [
  [/^серную кислоту(?=\s|$)/i, 'Серная кислота'],
  [/^азотную кислоту(?=\s|$)/i, 'Азотная кислота'],
  [/^соляную кислоту(?=\s|$)/i, 'Соляная кислота'],
  [/^серу молотую(?=\s|$)/i, 'Сера молотая'],
  [/^железную вату(?=\s|$)/i, 'Железная вата'],
]

export function cleanProductName(rawName: string): { name: string; metaTitle: string | null } {
  const raw = rawName.trim()
  const hasSeoPattern = /^Купить\s/i.test(raw) && raw.includes(' | ')
  if (!hasSeoPattern) return { name: raw, metaTitle: null }

  let display = raw.split(' | ', 1)[0]!.trim()
  display = display.replace(/^Купить\s+/i, '').trim()

  for (const [re, replacement] of ACCUSATIVE_HEADS) {
    if (re.test(display)) {
      display = display.replace(re, replacement)
      break
    }
  }
  // Capitalise the leading letter (nominative fixups already do; this covers
  // the pass-through nominative heads like "сульфат алюминия …").
  if (display) display = display[0]!.toUpperCase() + display.slice(1)

  return { name: display, metaTitle: raw }
}

// The main product text block uses `<br /><br />` as a paragraph separator.
// Split on double-<br> runs, keep single <br> as an in-paragraph line break,
// sanitize each chunk and wrap it in <p> for the shared ParagraphBlock shape.
export function textToParagraphBlocks(text: string | null | undefined): ParagraphBlock[] {
  if (!text) return []
  const chunks = text.split(/(?:\s*<br\s*\/?>\s*){2,}/i)
  const blocks: ParagraphBlock[] = []
  for (const chunk of chunks) {
    const cleaned = sanitizeHtml(
      chunk.replace(/^(?:\s*<br\s*\/?>\s*)+|(?:\s*<br\s*\/?>\s*)+$/gi, '').trim(),
    ).trim()
    if (!cleaned) continue
    blocks.push({ type: 'paragraph', html: `<p>${cleaned}</p>` })
  }
  return blocks
}

export function assertUniqueSlugs(slugs: string[]): void {
  const seen = new Set<string>()
  for (const slug of slugs) {
    if (seen.has(slug)) {
      throw new Error(`duplicate product slug after overrides: ${slug}`)
    }
    seen.add(slug)
  }
}
