import type { BlogPost, Page, Product, ProductCategory } from '@ximi4ka-shop/shared'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface Paginated<T> {
  data: T[]
  pagination: { limit: number; offset: number; total: number }
}

interface DataEnvelope<T> {
  data: T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let code = 'unknown'
    let message = `Request failed with status ${res.status}`
    let details: unknown
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
      if (body?.error) {
        code = body.error.code ?? code
        message = body.error.message ?? message
        details = body.error.details
      }
    } catch {
      // Response body wasn't JSON; fall through with defaults.
    }
    throw new ApiError(res.status, code, message, details)
  }

  return (await res.json()) as T
}

function buildListQuery(opts: { limit?: number; offset?: number }): string {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// ---------- Products (public) ----------

// Server-augmented shape returned when the caller passes `include: 'categories'`.
// The base Product type stays unchanged so all existing consumers still
// compile; YML/feed code that needs categoryIds narrows via this alias.
export type ProductWithCategories = Product & { categoryIds: string[] }

export async function listPublishedProducts(
  opts: { limit?: number; offset?: number; include?: 'categories' } = {},
): Promise<Paginated<Product>> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  if (opts.include) params.set('include', opts.include)
  const qs = params.toString()
  return request<Paginated<Product>>(
    `/api/public/products${qs ? `?${qs}` : ''}`,
  )
}

export async function getPublishedProduct(slug: string): Promise<Product> {
  const body = await request<DataEnvelope<Product>>(
    `/api/public/products/${encodeURIComponent(slug)}`,
  )
  return body.data
}

// ---------- Categories (public) ----------

export async function listCategories(
  opts: { limit?: number; offset?: number } = {},
): Promise<Paginated<ProductCategory>> {
  return request<Paginated<ProductCategory>>(
    `/api/public/categories${buildListQuery(opts)}`,
  )
}

export async function getCategory(slug: string): Promise<ProductCategory> {
  const body = await request<DataEnvelope<ProductCategory>>(
    `/api/public/categories/${encodeURIComponent(slug)}`,
  )
  return body.data
}

export async function listProductsByCategory(
  categorySlug: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<Paginated<Product>> {
  return request<Paginated<Product>>(
    `/api/public/categories/${encodeURIComponent(categorySlug)}/products${buildListQuery(opts)}`,
  )
}

// ---------- Pages (public) ----------

export async function getPage(slug: string): Promise<Page> {
  const body = await request<DataEnvelope<Page>>(
    `/api/public/pages/${encodeURIComponent(slug)}`,
  )
  return body.data
}

export async function listPages(
  opts: { limit?: number; offset?: number } = {},
): Promise<Paginated<Page>> {
  return request<Paginated<Page>>(`/api/public/pages${buildListQuery(opts)}`)
}

// ---------- Blog (public) ----------

// The blog listing is page-based (?page=&limit=) rather than offset-based —
// the storefront renders numbered pagination. The API echoes the resolved
// page alongside the standard offset envelope.
export interface BlogListResponse {
  data: BlogPost[]
  pagination: { limit: number; offset: number; page: number; total: number }
}

export async function listBlogPosts(
  opts: { page?: number; limit?: number } = {},
): Promise<BlogListResponse> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.page != null) params.set('page', String(opts.page))
  const qs = params.toString()
  return request<BlogListResponse>(`/api/public/blog${qs ? `?${qs}` : ''}`)
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost> {
  const body = await request<DataEnvelope<BlogPost>>(
    `/api/public/blog/${encodeURIComponent(slug)}`,
  )
  return body.data
}

// ---------- Public site settings ----------

export interface PublicTrustStripItem {
  icon: string
  label: string
}

export interface PublicTestimonial {
  quote: string
  author: string
  location: string
  rating?: number
}

export interface PublicSettings {
  metrikaId: string | null
  ga4Id: string | null
  robotsTxt: string
  llmsTxt: string
  yandexWebmasterVerification: string | null
  googleSiteVerification: string | null
  ymlShopName: string | null
  ymlCompany: string | null
  ymlUrl: string | null
  ymlCurrency: 'RUB' | 'RUR'
  ymlDeliveryNote: string | null
  headerPromoText: string | null
  trustStripItems: PublicTrustStripItem[]
  testimonials: PublicTestimonial[]
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const body = await request<DataEnvelope<PublicSettings>>(
    `/api/public/settings`,
  )
  return body.data
}
