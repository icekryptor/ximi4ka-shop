import type { Product } from '@ximi4ka-shop/shared'
import { siteUrl } from './metadata'

export interface OrganizationLd {
  '@context': 'https://schema.org'
  '@type': 'Organization'
  name: string
  url: string
  logo: string
}

export function organizationJsonLd(): OrganizationLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Ximi4ka',
    url: base,
    logo: `${base}/logo.png`,
  }
}

export interface WebSiteLd {
  '@context': 'https://schema.org'
  '@type': 'WebSite'
  name: string
  url: string
  potentialAction: {
    '@type': 'SearchAction'
    target: string
    'query-input': string
  }
}

export function websiteJsonLd(): WebSiteLd {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Ximi4ka',
    url: base,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${base}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
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
  offers: {
    '@type': 'Offer'
    url: string
    priceCurrency: 'RUB'
    price: number
    availability: string
  }
}

export function productJsonLd(product: Product): ProductLd {
  const url = `${siteUrl()}/product/${product.slug}`
  const images = product.images?.map((img) => img.url)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: product.sku ?? undefined,
    image: images && images.length > 0 ? images : undefined,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'RUB',
      price: product.priceRub,
      availability: availabilityUrl(product.stockStatus),
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
  '@type': 'Article'
  headline: string
  datePublished: string
  dateModified: string
  author: { '@type': 'Organization'; name: string }
  publisher: { '@type': 'Organization'; name: string }
}

// Structural input so both CMS Pages and BlogPosts fit. Blog posts carry an
// editorial `publishedAt` which — when set — is the true publication date;
// CMS pages only have createdAt.
export interface ArticleLdInput {
  title: string
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export function articleJsonLd(page: ArticleLdInput): ArticleLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.title,
    datePublished: page.publishedAt ?? page.createdAt,
    dateModified: page.updatedAt,
    author: { '@type': 'Organization', name: 'Ximi4ka' },
    publisher: { '@type': 'Organization', name: 'Ximi4ka' },
  }
}
