// Compact search results returned by `/api/public/search`. Deliberately
// narrow (only what the header preview renders) so the endpoint stays
// CDN-cacheable and never leaks unpublished or SEO-only fields.

export interface SearchProductResult {
  slug: string
  name: string
  priceRub: number
  image: string | null
}

export interface SearchPostResult {
  slug: string
  title: string
}

export interface SearchResult {
  products: SearchProductResult[]
  posts: SearchPostResult[]
}
