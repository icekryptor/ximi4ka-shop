import type { StockStatus } from './product.js'

// Compact search results returned by `/api/public/search`. Deliberately
// narrow (only what the header preview renders) so the endpoint stays
// CDN-cacheable and never leaks unpublished or SEO-only fields.

export interface SearchProductResult {
  id: string
  slug: string
  name: string
  priceRub: number
  image: string | null
  stockStatus: StockStatus
  /** Слаги категорий: по ним оптовый блок считает процентную скидку. */
  categories: string[]
}

export interface SearchPostResult {
  slug: string
  title: string
}

export interface SearchResult {
  products: SearchProductResult[]
  posts: SearchPostResult[]
}
