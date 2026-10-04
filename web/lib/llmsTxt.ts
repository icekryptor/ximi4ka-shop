import type { BlogPost, Page, Product, ProductCategory } from '@ximi4ka-shop/shared'
import { DEFAULT_SITE_DESCRIPTION } from './metadata'

// llms.txt по формату llmstxt.org: H1 с названием, blockquote с описанием и
// разделы H2 со списками ссылок `- [название](url): пояснение`. Файл отдаётся,
// когда текст в настройках сайта пустой. Ссылки абсолютные, без языкового
// префикса — это страницы языка по умолчанию (русского).

// Потолки, чтобы файл оставался небольшим: его читают модели целиком.
export const LLMS_MAX_PRODUCTS = 200
export const LLMS_MAX_POSTS = 100

const MAX_DESCRIPTION_LENGTH = 160

export interface LlmsTxtInput {
  siteUrl: string
  categories: ProductCategory[]
  products: Product[]
  posts: BlogPost[]
  pages: Page[]
}

function oneLine(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function shorten(text: string): string {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text
  return `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
}

function entry(title: string, url: string, description?: string | null): string {
  const label = oneLine(title).replace(/([[\]])/g, '\\$1')
  const note = shorten(oneLine(description))
  return note ? `- [${label}](${url}): ${note}` : `- [${label}](${url})`
}

function section(heading: string, lines: string[]): string[] {
  return lines.length > 0 ? [`## ${heading}`, '', ...lines, ''] : []
}

export function generateLlmsTxt(input: LlmsTxtInput): string {
  const { siteUrl } = input

  const catalog = [
    ...input.categories.map((c) =>
      entry(c.name, `${siteUrl}/categories/${c.slug}`, c.metaDescription),
    ),
    ...input.products
      .filter((p) => !p.noindex)
      .slice(0, LLMS_MAX_PRODUCTS)
      .map((p) => entry(p.name, `${siteUrl}/product/${p.slug}`, p.shortDescription)),
  ]
  const blog = input.posts
    .filter((p) => !p.noindex)
    .slice(0, LLMS_MAX_POSTS)
    .map((p) => entry(p.title, `${siteUrl}/blog/${p.slug}`, p.excerpt ?? p.metaDescription))
  const info = input.pages
    .filter((p) => p.slug !== 'home' && !p.noindex)
    .map((p) => entry(p.title, `${siteUrl}/${p.slug}`, p.metaDescription))

  return [
    '# Химичка',
    '',
    `> ${DEFAULT_SITE_DESCRIPTION}`,
    '',
    `Сайт: ${siteUrl}`,
    '',
    ...section('Каталог', catalog),
    ...section('Блог', blog),
    ...section('Информация', info),
  ]
    .join('\n')
    .trimEnd()
    .concat('\n')
}
