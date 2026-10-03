import type { Product } from '@ximi4ka-shop/shared'
import { siteUrl } from './metadata'

// Бренд в разметке — «Химичка» (рекомендации SEO-аудита). Юрлицо и ИНН
// не указываем, пока владелец не подтвердит, какое из ИП выводить.
export const BRAND_NAME = 'Химичка'
const BRAND_ALT_NAME = 'Ximi4ka'
const LOGO_PATH = '/logo-himichka.svg'
const SAME_AS = ['https://t.me/ximi4kapublic']

/** Корневой путь (/uploads/…) → абсолютный URL сайта; абсолютные не трогаем. */
export function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${siteUrl()}${url.startsWith('/') ? '' : '/'}${url}`
}

export interface OrganizationLd {
  '@context': 'https://schema.org'
  '@type': 'Organization'
  '@id': string
  name: string
  alternateName: string
  url: string
  logo: string
  sameAs: string[]
}

export function organizationJsonLd(): OrganizationLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: BRAND_NAME,
    alternateName: BRAND_ALT_NAME,
    url: base,
    logo: `${base}${LOGO_PATH}`,
    sameAs: SAME_AS,
  }
}

export interface WebSiteLd {
  '@context': 'https://schema.org'
  '@type': 'WebSite'
  name: string
  url: string
  publisher: { '@id': string }
}

// Без SearchAction: страницы /search нет, поиск живёт только в шапке, а
// SearchAction на несуществующий адрес — ошибка разметки.
export function websiteJsonLd(): WebSiteLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND_NAME,
    url: base,
    publisher: { '@id': `${base}/#organization` },
  }
}

export interface BreadcrumbItem {
  name: string
  /** Absolute or root-relative URL; relative paths are turned absolute using the site URL. */
  url: string
}

export interface BreadcrumbListLd {
  '@context': 'https://schema.org'
  '@type': 'BreadcrumbList'
  itemListElement: Array<{
    '@type': 'ListItem'
    position: number
    name: string
    item: string
  }>
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): BreadcrumbListLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${base}${item.url}`,
    })),
  }
}

function availabilityUrl(status: Product['stockStatus']): string {
  switch (status) {
    case 'in_stock':
      return 'https://schema.org/InStock'
    case 'preorder':
      return 'https://schema.org/PreOrder'
    case 'out_of_stock':
    default:
      return 'https://schema.org/OutOfStock'
  }
}

export interface ProductLd {
  '@context': 'https://schema.org'
  '@type': 'Product'
  name: string
  description?: string
  sku?: string
  image?: string[]
  brand: { '@type': 'Brand'; name: string }
  offers: {
    '@type': 'Offer'
    url: string
    priceCurrency: 'RUB'
    price: number
    availability: string
    itemCondition: 'https://schema.org/NewCondition'
    seller: { '@id': string }
  }
}

export function productJsonLd(product: Product): ProductLd {
  const base = siteUrl()
  const url = `${base}/product/${product.slug}`
  const images = product.images?.map((img) => absoluteUrl(img.url))
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: product.sku ?? undefined,
    image: images && images.length > 0 ? images : undefined,
    brand: { '@type': 'Brand', name: BRAND_NAME },
    // Цена и наличие — только из базы; рейтинга нет, пока нет отзывов.
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'RUB',
      price: product.priceRub,
      availability: availabilityUrl(product.stockStatus),
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${base}/#organization` },
    },
  }
}

export interface ItemListLd {
  '@context': 'https://schema.org'
  '@type': 'ItemList'
  itemListElement: Array<{
    '@type': 'ListItem'
    position: number
    url: string
    name: string
  }>
}

export function itemListJsonLd(products: Product[]): ItemListLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${base}/product/${p.slug}`,
      name: p.name,
    })),
  }
}

export interface ArticleLd {
  '@context': 'https://schema.org'
  '@type': 'Article' | 'BlogPosting'
  headline: string
  description?: string
  image?: string[]
  datePublished: string
  dateModified: string
  mainEntityOfPage?: { '@type': 'WebPage'; '@id': string }
  author: { '@type': 'Organization'; name: string; url: string }
  publisher: {
    '@type': 'Organization'
    name: string
    logo: { '@type': 'ImageObject'; url: string }
  }
}

// Structural input so both CMS Pages and BlogPosts fit. Blog posts carry an
// editorial `publishedAt` which — when set — is the true publication date;
// CMS pages only have createdAt.
export interface ArticleLdInput {
  title: string
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  description?: string | null
  image?: string | null
  /** Путь или абсолютный URL страницы — для mainEntityOfPage. */
  url?: string
}

export function articleJsonLd(
  page: ArticleLdInput,
  type: 'Article' | 'BlogPosting' = 'Article',
): ArticleLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': type,
    headline: page.title,
    description: page.description?.trim() || undefined,
    image: page.image ? [absoluteUrl(page.image)] : undefined,
    datePublished: page.publishedAt ?? page.createdAt,
    dateModified: page.updatedAt,
    mainEntityOfPage: page.url ? { '@type': 'WebPage', '@id': absoluteUrl(page.url) } : undefined,
    author: { '@type': 'Organization', name: BRAND_NAME, url: base },
    publisher: {
      '@type': 'Organization',
      name: BRAND_NAME,
      logo: { '@type': 'ImageObject', url: `${base}${LOGO_PATH}` },
    },
  }
}
