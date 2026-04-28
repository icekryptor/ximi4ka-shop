import type { TildaRow } from './csv-parse.js'
import { sanitizeHtml } from './sanitize-html.js'
import { slugify } from './slugify.js'

export type ParagraphBlock = { type: 'paragraph'; html: string }
export type ProductBlock = ParagraphBlock

export interface ParsedTildaProduct {
  name: string
  slug: string
  sku: string | null
  shortDescription: string | null
  priceRub: number
  compareAtPriceRub: number | null
  categoryNames: string[]
  photoUrls: string[]
  longDescriptionBlocks: ProductBlock[]
  metaTitle: string | null
  metaDescription: string | null
}

// Pull the slug from the Tilda Url last path segment, stripping the leading
// "<numbers>-". Tilda URLs look like:
//   https://ximi4ka.ru/catalog/kits/tproduct/279167718312-himichka-30
// where "279167718312" is the Tilda product id and "himichka-30" is the slug
// we want. If the URL is missing or the last segment has no slug part, fall
// back to a transliterated Title.
export function deriveSlug(row: TildaRow): string {
  const url = (row.Url ?? '').trim()
  if (url) {
    const lastSegment = url.split('/').filter(Boolean).pop() || ''
    const cleaned = lastSegment.replace(/^\d+-/, '')
    if (cleaned) return cleaned
  }
  return slugify(row.Title ?? '')
}

export function parseCategoryNames(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function parsePhotoUrls(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseIntPrice(raw: string | undefined): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

function nonEmpty(s: string | undefined | null): string | null {
  if (s === undefined || s === null) return null
  const t = s.trim()
  return t === '' ? null : t
}

// Build the "Характеристики" HTML block from all `Characteristics:*` columns.
// Returns null if none are filled.
function buildCharacteristicsHtml(row: TildaRow): string | null {
  const items: string[] = []
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('Characteristics:')) continue
    const label = key.slice('Characteristics:'.length).trim()
    const v = (value ?? '').trim()
    if (!label || !v) continue
    // Escape angle brackets in label/value to keep this as a list, not nested HTML.
    const safeLabel = escapeHtml(label)
    const safeValue = escapeHtml(v)
    items.push(`<li><strong>${safeLabel}:</strong> ${safeValue}</li>`)
  }
  if (items.length === 0) return null
  return `<h3>Характеристики</h3>\n<ul>${items.join('')}</ul>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Tabs:2 in Tilda exports has the form "<type>|#|<heading>|#|<html>".
// Returns the parsed parts or null when the value is missing or malformed.
function parseTab(raw: string | undefined): { heading: string; html: string } | null {
  if (!raw) return null
  const parts = raw.split('|#|')
  if (parts.length < 3) return null
  const heading = parts[1]?.trim() ?? ''
  const html = parts.slice(2).join('|#|').trim()
  if (!heading || !html) return null
  return { heading, html }
}

// Convert a single CSV row into a ParsedTildaProduct, or null if the row is
// missing a Title (the only required field). Slug deduplication and image
// downloads happen later — this function is pure.
export function parseTildaRow(row: TildaRow): ParsedTildaProduct | null {
  const name = (row.Title ?? '').trim()
  if (!name) return null

  const priceRub = parseIntPrice(row.Price) ?? 0
  const oldPrice = parseIntPrice(row['Price Old'])
  const compareAtPriceRub = oldPrice !== null && oldPrice > priceRub ? oldPrice : null

  const blocks: ProductBlock[] = []

  // 1. Main Text → paragraph
  const text = nonEmpty(row.Text)
  if (text) {
    const html = sanitizeHtml(text)
    if (html) blocks.push({ type: 'paragraph', html })
  }

  // 2. Tabs:2 (e.g. Состав)
  const tab = parseTab(row['Tabs:2'])
  if (tab) {
    const sanitized = sanitizeHtml(tab.html)
    if (sanitized) {
      blocks.push({
        type: 'paragraph',
        html: `<h3>${escapeHtml(tab.heading)}</h3>\n${sanitized}`,
      })
    }
  }

  // 3. Characteristics
  const charHtml = buildCharacteristicsHtml(row)
  if (charHtml) {
    blocks.push({ type: 'paragraph', html: charHtml })
  }

  return {
    name,
    slug: deriveSlug(row),
    sku: nonEmpty(row.SKU),
    shortDescription: nonEmpty(row.Description),
    priceRub,
    compareAtPriceRub,
    categoryNames: parseCategoryNames(row.Category ?? ''),
    photoUrls: parsePhotoUrls(row.Photo ?? ''),
    longDescriptionBlocks: blocks,
    metaTitle: nonEmpty(row['SEO title']),
    metaDescription: nonEmpty(row['SEO descr']),
  }
}
