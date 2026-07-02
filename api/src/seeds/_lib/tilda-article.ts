// Helpers for importing the four real blog articles from a crawl of the old
// Tilda site (ximi4ka.ru). Pure parsing lives here so it is unit-testable;
// file discovery and DB writes live in ../import-tilda-articles.ts.
//
// A Tilda page is a flat list of records (`<div id="recNNN" data-record-type="T">`).
// The article body is reconstructed record-by-record:
//   t033  (33)   → <h2> heading paragraph (field="title")
//   t004  (106)  → paragraph(s) (field="text", double-<br> splits paragraphs)
//   t396  (396)  → zero block: top-level texts → paragraphs, images → image
//                  blocks; flexed elems (t396__elem-flex) belong to promo
//                  groups (sticky product cards, telegram CTAs) and are skipped
//   t1861 (1861) → zero-block table (программа за год) → one <ul> paragraph
//   t668  (668)  → FAQ accordion → faq block
//   t1370 (1370) → custom «xp-blog» HTML (химия по классам) → heading/image/
//                  paragraph blocks per grade section, promo sidebar skipped
// Everything else (header, menus, breadcrumbs, product cards, forms, footer)
// is chrome and dropped.
import { sanitizeHtml } from './sanitize-html.js'

export type ArticleParagraphBlock = { type: 'paragraph'; html: string }
export type ArticleImageBlock = { type: 'image'; url: string; alt: string }
export type ArticleFaqBlock = {
  type: 'faq'
  items: Array<{ question: string; answer: string }>
}
export type ArticleBlock = ArticleParagraphBlock | ArticleImageBlock | ArticleFaqBlock

export interface ArticleSource {
  /** Old-site URL, matched against <link rel="canonical"> in the crawl. */
  sourceUrl: string
  /** New blog slug (kebab-case, becomes /blog/{slug}). */
  slug: string
  title: string
  rubric: string
  /** Publish-date spread: publishedAt = now − N days (last article freshest). */
  publishedDaysAgo: number
}

// Order matters: oldest first — the last entry gets today's date.
export const ARTICLE_SOURCES: ArticleSource[] = [
  {
    sourceUrl: 'https://ximi4ka.ru/blog/khimiya_v_shkole',
    slug: 'khimiya-v-shkole',
    title: 'Химия в школе: как понять предмет и получать отличные оценки?',
    rubric: 'Химия школьнику',
    publishedDaysAgo: 3,
  },
  {
    sourceUrl: 'https://ximi4ka.ru/nabory-dlya-opytov-himichka',
    slug: 'nabory-dlya-opytov-himichka',
    title: 'Откройте мир химии: наборы для опытов Химичка, составленные профессионалами',
    rubric: 'Наборы для опытов',
    publishedDaysAgo: 2,
  },
  {
    sourceUrl: 'https://ximi4ka.ru/page131110046.html',
    slug: 'podhodyat-li-nabory-dlya-oge',
    title: 'Подходят ли наши наборы для опытов для подготовки к ОГЭ?',
    rubric: 'Химия школьнику',
    publishedDaysAgo: 1,
  },
  {
    sourceUrl: 'https://ximi4ka.ru/himiya-8-klass-programma',
    slug: 'himiya-8-klass-programma',
    title: 'Химия 8 класс: программа, главные темы и с чего начать',
    rubric: 'Химия школьнику',
    publishedDaysAgo: 0,
  },
]

// Tilda header/footer zero blocks share record ids across every crawled page
// (same «ХИМИЧКА» menu + footer on all of them). They carry text atoms, so
// the generic zero-block rules would leak menu items into the article body —
// hence the explicit id skip-list.
export const CHROME_RECORD_IDS = [
  'rec1746235851', // sticky header (logo, cart counter)
  'rec1000654466', // main menu (Реактивы / Оборудование / Наборы / Комбо)
  'rec1757307951', // footer (ИП Аистов, оферта, политика)
]

// Record types that are always page chrome, never article content:
// 360 cart popup, 131 menus, 706 burger, 758 breadcrumbs, 121 product cards,
// 247 order form, 270 misc footer widget.
const CHROME_RECORD_TYPES = new Set(['360', '131', '706', '758', '121', '247', '270'])

// Store-promo section header that precedes the product-card grid on every
// article — not part of the article text.
const PROMO_HEADINGS = new Set(['наши наборы'])

export interface TildaRecord {
  id: string
  type: string
  html: string
}

export function splitRecords(html: string): TildaRecord[] {
  const records: TildaRecord[] = []
  const parts = html.split(/(?=<div id="rec\d+")/)
  for (const part of parts) {
    const m = /^<div id="(rec\d+)"[^>]*data-record-type="(\d+)"/.exec(part)
    if (!m) continue
    records.push({ id: m[1]!, type: m[2]!, html: part })
  }
  return records
}

export function extractCanonicalUrl(html: string): string | null {
  const m = /<link rel="canonical" href="([^"]+)"/.exec(html)
  return m ? m[1]! : null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function extractMetaDescription(html: string): string | null {
  const m = /<meta name="description" content="([^"]*)"/.exec(html)
  if (!m) return null
  const decoded = decodeHtmlEntities(m[1]!).trim()
  return decoded === '' ? null : decoded
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

// Strip Tilda's <style>/<script> siblings so attribute regexes never match
// inside CSS or embedded JSON.
function stripNonMarkup(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
}

// `field="title"` / `field="text"` content — Tilda emits it on h2/h3/div
// depending on the block settings.
function fieldContent(recordHtml: string, field: string): string | null {
  const re = new RegExp(`<(h\\d|div)[^>]*field="${field}"[^>]*>([\\s\\S]*?)</\\1>`)
  const m = re.exec(recordHtml)
  return m ? m[2]!.trim() : null
}

// Text records use `<br /><br />` as a paragraph separator (same convention
// as product descriptions — see textToParagraphBlocks in tilda-crawl.ts).
// Chunks containing block-level lists are emitted unwrapped — `<ul>` inside
// `<p>` is invalid HTML and browsers re-parent it.
function textToParagraphs(html: string): ArticleParagraphBlock[] {
  const blocks: ArticleParagraphBlock[] = []
  for (const chunk of html.split(/(?:\s*<br\s*\/?>\s*){2,}/i)) {
    const cleaned = sanitizeHtml(
      chunk.replace(/^(?:\s*<br\s*\/?>\s*)+|(?:\s*<br\s*\/?>\s*)+$/gi, '').trim(),
    )
      .replace(/ data-list="[^"]*"/g, '')
      .trim()
    if (!cleaned) continue
    const hasBlockLevel = /<(?:ul|ol|h\d|blockquote)[\s>]/i.test(cleaned)
    blocks.push({ type: 'paragraph', html: hasBlockLevel ? cleaned : `<p>${cleaned}</p>` })
  }
  return blocks
}

// ---- Zero blocks (t396) -----------------------------------------------------

interface ZeroElem {
  elemType: string
  flexed: boolean
  html: string
  top: number | null
  left: number | null
  width: number | null
}

function splitZeroElems(recordHtml: string): ZeroElem[] {
  const elems: ZeroElem[] = []
  const parts = recordHtml.split(/(?=<div class='t396__elem)/)
  for (const part of parts) {
    const m = /^<div class='([^']*)'[^>]*data-elem-type='(\w+)'/.exec(part)
    if (!m) continue
    const num = (attr: string): number | null => {
      const am = new RegExp(`data-field-${attr}-value="(-?\\d+)"`).exec(part)
      return am ? Number(am[1]) : null
    }
    elems.push({
      elemType: m[2]!,
      flexed: m[1]!.includes('t396__elem-flex'),
      html: part,
      top: num('top'),
      left: num('left'),
      width: num('width'),
    })
  }
  return elems
}

// Minimum width for a background-image shape to count as a content image —
// filters out 1px divider lines and small sticky-card thumbnails.
const MIN_CONTENT_IMAGE_WIDTH = 400

function zeroBlockToBlocks(recordHtml: string, fallbackAlt: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = []
  for (const elem of splitZeroElems(recordHtml)) {
    // Flexed elems live inside tn-groups: sticky product cards, telegram
    // CTAs, «автор/дата» chips. Never article body.
    if (elem.flexed) continue
    if (elem.elemType === 'text') {
      const atom = /<(h\d|div|a)[^>]*class='tn-atom[^']*'[^>]*>([\s\S]*?)<\/\1>/.exec(elem.html)
      if (!atom) continue
      // The page h1 becomes BlogPost.title, not a body block.
      if (atom[1]!.toLowerCase() === 'h1') continue
      blocks.push(...textToParagraphs(atom[2]!))
    } else if (elem.elemType === 'image') {
      const img = /<img[^>]*data-original='([^']+)'[\s\S]*?alt='([^']*)'/.exec(elem.html)
      if (!img) continue
      blocks.push({ type: 'image', url: img[1]!, alt: img[2]!.trim() || fallbackAlt })
    } else if (elem.elemType === 'shape') {
      if (elem.width === null || elem.width < MIN_CONTENT_IMAGE_WIDTH) continue
      const bg = /class='tn-atom[^']*'\s+data-original="([^"]+)"/.exec(elem.html)
      if (!bg) continue
      blocks.push({ type: 'image', url: bg[1]!, alt: fallbackAlt })
    }
  }
  return blocks
}

// ---- Zero-block tables (t1861) ----------------------------------------------

// The «программа за год» table is a zero block of positioned text atoms:
// three columns (left ≈ 40 / 320 / 620) per row, rows separated by 1px shapes.
// Group texts into rows by their top offset (±8px tolerance) and render as a
// definition-style list.
function tableToBlocks(recordHtml: string): ArticleBlock[] {
  const cells: Array<{ top: number; left: number; text: string }> = []
  for (const elem of splitZeroElems(recordHtml)) {
    if (elem.elemType !== 'text' || elem.top === null || elem.left === null) continue
    const atom = /<(h\d|div)[^>]*class='tn-atom[^']*'[^>]*>([\s\S]*?)<\/\1>/.exec(elem.html)
    if (!atom) continue
    const text = stripTags(atom[2]!)
    if (text) cells.push({ top: elem.top, left: elem.left, text })
  }
  if (cells.length === 0) return []

  cells.sort((a, b) => a.top - b.top || a.left - b.left)
  const rows: Array<Array<{ left: number; text: string }>> = []
  let currentTop = Number.NEGATIVE_INFINITY
  for (const cell of cells) {
    if (cell.top - currentTop > 8) {
      rows.push([])
      currentTop = cell.top
    }
    rows[rows.length - 1]!.push({ left: cell.left, text: cell.text })
  }

  const items = rows
    .filter((row) => row.length > 0)
    .map((row) => {
      const [head, ...rest] = row.map((c) => escapeHtml(c.text))
      if (rest.length === 0) return `<li>${head}</li>`
      const tail = rest.length > 1 ? `${rest[0]} (${rest.slice(1).join('; ')})` : rest[0]!
      return `<li><strong>${head}</strong> — ${tail}</li>`
    })
  if (items.length === 0) return []
  return [{ type: 'paragraph', html: `<ul>${items.join('')}</ul>` }]
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---- FAQ accordions (t668) --------------------------------------------------

function faqToBlocks(recordHtml: string): ArticleBlock[] {
  const items: Array<{ question: string; answer: string }> = []
  const re =
    /field="li_title__\d+"[^>]*>([\s\S]*?)<\/span>[\s\S]*?field="li_descr__\d+"[^>]*>([\s\S]*?)<\/div>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(recordHtml)) !== null) {
    const question = stripTags(m[1]!)
    const answer = stripTags(m[2]!)
    if (question && answer) items.push({ question, answer })
  }
  return items.length > 0 ? [{ type: 'faq', items }] : []
}

// ---- Custom xp-blog records (t1370) ------------------------------------------

// Hand-written «химия по классам» HTML: per-grade <section>s where the main
// column holds the content and the sidebar is a sticky product promo.
function xpBlogToBlocks(recordHtml: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = []
  const sections = recordHtml.match(/<section class="xp-blog__grade[\s\S]*?<\/section>/g) ?? []
  for (const section of sections) {
    const main = section.split('xp-blog__grade-sidebar')[0]!
    const num = /grade-number">\s*(\d+)\s*</.exec(main)
    const title = /grade-title">([\s\S]*?)</.exec(main)
    if (num && title) {
      blocks.push({
        type: 'paragraph',
        html: `<h2>${num[1]} класс — ${stripTags(title[1]!)}</h2>`,
      })
    }
    const img = /class="xp-blog__grade-image" src="([^"]+)" alt="([^"]*)"/.exec(main)
    if (img) blocks.push({ type: 'image', url: img[1]!, alt: img[2]!.trim() })
    const ps = main.match(/<p class="xp-blog__grade-text">[\s\S]*?<\/p>/g) ?? []
    for (const p of ps) {
      const inner = p.replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '')
      blocks.push(...textToParagraphs(inner))
    }
  }
  return blocks
}

// ---- Top-level extraction -----------------------------------------------------

export function extractArticleBlocks(pageHtml: string, articleTitle: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = []
  for (const record of splitRecords(pageHtml)) {
    if (CHROME_RECORD_TYPES.has(record.type)) continue
    if (CHROME_RECORD_IDS.includes(record.id)) continue
    const body = stripNonMarkup(record.html)

    if (record.type === '33') {
      const title = fieldContent(body, 'title')
      if (!title) continue
      const text = stripTags(title)
      if (!text || PROMO_HEADINGS.has(text.toLowerCase())) continue
      blocks.push({ type: 'paragraph', html: `<h2>${escapeHtml(text)}</h2>` })
    } else if (record.type === '106') {
      const text = fieldContent(body, 'text')
      if (text) blocks.push(...textToParagraphs(text))
    } else if (record.type === '396') {
      blocks.push(...zeroBlockToBlocks(body, articleTitle))
    } else if (record.type === '1861') {
      blocks.push(...tableToBlocks(body))
    } else if (record.type === '668') {
      blocks.push(...faqToBlocks(body))
    } else if (record.type === '1370') {
      blocks.push(...xpBlogToBlocks(body))
    }
  }
  return blocks
}

const EXCERPT_MAX_LENGTH = 200

// First real paragraph (not a heading), tags stripped, cut at a word
// boundary to ≤200 chars.
export function deriveExcerpt(blocks: ArticleBlock[]): string | null {
  for (const block of blocks) {
    if (block.type !== 'paragraph') continue
    if (!block.html.startsWith('<p')) continue
    const text = stripTags(block.html)
    if (!text) continue
    if (text.length <= EXCERPT_MAX_LENGTH) return text
    const cut = text.slice(0, EXCERPT_MAX_LENGTH)
    const lastSpace = cut.lastIndexOf(' ')
    return `${cut.slice(0, lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH).replace(/[,;:.!?]$/, '')}…`
  }
  return null
}
