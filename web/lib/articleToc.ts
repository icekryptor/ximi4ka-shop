import { slugify } from './slugify'

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

/** Оглавление показываем, когда в статье не меньше трёх заголовков. */
export const TOC_MIN_HEADINGS = 3

export function shouldShowToc(toc: TocItem[]): boolean {
  return toc.length >= TOC_MIN_HEADINGS
}

const HEADING_RE = /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi
const ID_ATTR_RE = /\s+id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const FALLBACK_ID = 'razdel'

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
}

function headingText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim()
}

/** Якорь из текста заголовка; на коллизию добавляет -2, -3… пока не станет свободным. */
function uniqueId(text: string, used: Set<string>): string {
  const base = slugify(text) || FALLBACK_ID
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

function anchorHtml(html: string, used: Set<string>, toc: TocItem[]): string {
  return html.replace(HEADING_RE, (whole, level: string, attrs: string | undefined, inner) => {
    const text = headingText(inner)
    if (!text) return whole
    const id = uniqueId(text, used)
    toc.push({ id, text, level: Number(level) as 2 | 3 })
    const keptAttrs = (attrs ?? '').replace(ID_ATTR_RE, '')
    return `<h${level}${keptAttrs} id="${id}">${inner}</h${level}>`
  })
}

/**
 * Проставляет якоря (`id`) на h2/h3 в HTML-блоках статьи и собирает
 * оглавление. Заголовки живут внутри HTML абзацев (`paragraph`) и текста
 * `layout`-блоков — других источников h2/h3 у статьи нет. Id уникальны на
 * всю статью, стабильны (зависят только от текста и порядка) и не требуют
 * правок в данных. Входные блоки не мутируются; блоки без заголовков
 * возвращаются той же ссылкой.
 */
export function addHeadingAnchors(blocks: unknown[]): { blocks: unknown[]; toc: TocItem[] } {
  const used = new Set<string>()
  const toc: TocItem[] = []

  const out = blocks.map((block) => {
    if (typeof block !== 'object' || block === null) return block
    const b = block as { type?: unknown; html?: unknown; text?: { html?: unknown } }
    if (b.type === 'paragraph' && typeof b.html === 'string') {
      const html = anchorHtml(b.html, used, toc)
      return html === b.html ? block : { ...b, html }
    }
    if (b.type === 'layout' && typeof b.text?.html === 'string') {
      const html = anchorHtml(b.text.html, used, toc)
      return html === b.text.html ? block : { ...b, text: { ...b.text, html } }
    }
    return block
  })

  return { blocks: out, toc }
}
