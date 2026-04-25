import type { Page, Product, ProductCategory } from '@ximi4ka-shop/shared'
import { ApiError, type Paginated } from './api'

// Admin API client. Mirrors the public client in api.ts but:
//   * always sends cookies (credentials: 'include') — admin routes are
//     gated by the ximi4ka_shop_session cookie.
//   * adds X-CSRF-Token on mutations, read from the readable csrf cookie.
//
// Kept in a separate file from api.ts so a server component that happens
// to import the public client doesn't accidentally pull in anything that
// references document.cookie (the csrf read is client-only).

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export { ApiError } from './api'

export interface UploadResult {
  id: string
  url: string
  filename: string
  size: number
  width?: number
  height?: number
  mimeType: string
}

export interface Media {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  uploadedBy: string | null
  createdAt: string
}

export interface AdminProductInput {
  slug: string
  sku?: string | null
  name: string
  shortDescription?: string | null
  longDescriptionBlocks?: unknown[]
  priceRub: number
  compareAtPriceRub?: number | null
  stockStatus?: 'in_stock' | 'out_of_stock' | 'preorder'
  sortOrder?: number
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: string | null
  canonicalUrl?: string | null
  noindex?: boolean
  translations?: Record<string, unknown>
}

function readCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)ximi4ka_shop_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorEnvelope | null = null
  try {
    body = (await res.json()) as ErrorEnvelope
  } catch {
    // Response was not JSON — fall through to defaults.
  }
  return new ApiError(
    res.status,
    body?.error?.code ?? 'unknown',
    body?.error?.message ?? `Request failed with status ${res.status}`,
    body?.error?.details,
  )
}

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  }
  if (isMutation) {
    const csrf = readCsrfToken()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// --- products ---

export async function adminListProducts(
  opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<Paginated<Product>> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  if (opts.q) params.set('q', opts.q)
  const qs = params.toString()
  return authedRequest<Paginated<Product>>(`/api/admin/products${qs ? `?${qs}` : ''}`)
}

export async function adminGetProduct(id: string): Promise<Product> {
  const body = await authedRequest<{ data: Product }>(
    `/api/admin/products/${encodeURIComponent(id)}`,
  )
  return body.data
}

export async function adminCreateProduct(input: AdminProductInput): Promise<Product> {
  const body = await authedRequest<{ data: Product }>(`/api/admin/products`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.data
}

export async function adminUpdateProduct(
  id: string,
  input: Partial<AdminProductInput>,
): Promise<Product> {
  const body = await authedRequest<{ data: Product }>(
    `/api/admin/products/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return body.data
}

export async function adminPublishProduct(id: string): Promise<Product> {
  const body = await authedRequest<{ data: Product }>(
    `/api/admin/products/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  )
  return body.data
}

export async function adminUnpublishProduct(id: string): Promise<Product> {
  const body = await authedRequest<{ data: Product }>(
    `/api/admin/products/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST' },
  )
  return body.data
}

export async function adminDeleteProduct(id: string): Promise<void> {
  await authedRequest<void>(`/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// --- categories ---

export interface AdminCategoryInput {
  slug: string
  name: string
  parentId?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  sortOrder?: number
  translations?: Record<string, unknown>
}

// List returns up to 200 items in a single request — categories are few by
// design. Tree UIs need the whole set at once to resolve parent/child links,
// so there's no pagination in the page UX.
export async function adminListCategories(): Promise<
  Paginated<ProductCategory & { productCount: number }>
> {
  return authedRequest<Paginated<ProductCategory & { productCount: number }>>(
    `/api/admin/categories?limit=200`,
  )
}

export async function adminGetCategory(id: string): Promise<ProductCategory> {
  const body = await authedRequest<{ data: ProductCategory }>(
    `/api/admin/categories/${encodeURIComponent(id)}`,
  )
  return body.data
}

export async function adminCreateCategory(input: AdminCategoryInput): Promise<ProductCategory> {
  const body = await authedRequest<{ data: ProductCategory }>(`/api/admin/categories`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.data
}

export async function adminUpdateCategory(
  id: string,
  input: Partial<AdminCategoryInput>,
): Promise<ProductCategory> {
  const body = await authedRequest<{ data: ProductCategory }>(
    `/api/admin/categories/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return body.data
}

export async function adminDeleteCategory(id: string): Promise<void> {
  await authedRequest<void>(`/api/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// --- pages ---

export interface AdminPageInput {
  slug: string
  title: string
  blocks?: unknown[]
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: string | null
  canonicalUrl?: string | null
  noindex?: boolean
  translations?: Record<string, unknown>
}

export async function adminListPages(
  opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<Paginated<Page>> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  if (opts.q) params.set('q', opts.q)
  const qs = params.toString()
  return authedRequest<Paginated<Page>>(`/api/admin/pages${qs ? `?${qs}` : ''}`)
}

export async function adminGetPage(id: string): Promise<Page> {
  const body = await authedRequest<{ data: Page }>(
    `/api/admin/pages/${encodeURIComponent(id)}`,
  )
  return body.data
}

export async function adminCreatePage(input: AdminPageInput): Promise<Page> {
  const body = await authedRequest<{ data: Page }>(`/api/admin/pages`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.data
}

export async function adminUpdatePage(
  id: string,
  input: Partial<AdminPageInput>,
): Promise<Page> {
  const body = await authedRequest<{ data: Page }>(
    `/api/admin/pages/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return body.data
}

export async function adminPublishPage(id: string): Promise<Page> {
  const body = await authedRequest<{ data: Page }>(
    `/api/admin/pages/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  )
  return body.data
}

export async function adminUnpublishPage(id: string): Promise<Page> {
  const body = await authedRequest<{ data: Page }>(
    `/api/admin/pages/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST' },
  )
  return body.data
}

export async function adminDeletePage(id: string): Promise<void> {
  await authedRequest<void>(`/api/admin/pages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// --- redirects ---

export interface Redirect {
  id: string
  fromPath: string
  toPath: string
  statusCode: number
  hitCount: number
}

export interface AdminRedirectInput {
  fromPath: string
  toPath: string
  statusCode?: number
}

export interface RedirectCsvSummary {
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

export async function adminListRedirects(
  opts: { limit?: number; offset?: number; q?: string; sort?: string } = {},
): Promise<Paginated<Redirect>> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  if (opts.q) params.set('q', opts.q)
  if (opts.sort) params.set('sort', opts.sort)
  const qs = params.toString()
  return authedRequest<Paginated<Redirect>>(
    `/api/admin/redirects${qs ? `?${qs}` : ''}`,
  )
}

export async function adminGetRedirect(id: string): Promise<Redirect> {
  const body = await authedRequest<{ data: Redirect }>(
    `/api/admin/redirects/${encodeURIComponent(id)}`,
  )
  return body.data
}

export async function adminCreateRedirect(
  input: AdminRedirectInput,
): Promise<Redirect> {
  const body = await authedRequest<{ data: Redirect }>(`/api/admin/redirects`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.data
}

export async function adminUpdateRedirect(
  id: string,
  input: Partial<AdminRedirectInput>,
): Promise<Redirect> {
  const body = await authedRequest<{ data: Redirect }>(
    `/api/admin/redirects/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return body.data
}

export async function adminDeleteRedirect(id: string): Promise<void> {
  await authedRequest<void>(`/api/admin/redirects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function adminImportRedirectsCsv(
  file: File,
): Promise<RedirectCsvSummary> {
  // Multipart upload — let the browser set the content-type boundary itself,
  // same pattern as adminUploadImage.
  const form = new FormData()
  form.append('file', file)
  const csrf = readCsrfToken()
  const headers: Record<string, string> = {}
  if (csrf) headers['X-CSRF-Token'] = csrf
  const res = await fetch(`${API_BASE}/api/admin/redirects/import-csv`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  })
  if (!res.ok) throw await parseError(res)
  const body = (await res.json()) as { data: RedirectCsvSummary }
  return body.data
}

// --- settings (singleton) ---

export interface TrustStripItem {
  icon: string
  label: string
}

export interface Testimonial {
  quote: string
  author: string
  location: string
  rating?: number
}

export interface SiteSettings {
  id: string
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
  yandexPayEnabled: boolean
  yandexPayMode: 'sandbox' | 'production'
  headerPromoText: string | null
  trustStripItems: TrustStripItem[]
  testimonials: Testimonial[]
  updatedAt: string
}

export async function adminGetSettings(): Promise<SiteSettings> {
  const body = await authedRequest<{ data: SiteSettings }>(`/api/admin/settings`)
  return body.data
}

// Partial<SiteSettings> with `id`/`updatedAt` dropped — server ignores them.
export type AdminSettingsPatch = Partial<
  Omit<SiteSettings, 'id' | 'updatedAt'>
>

export async function adminUpdateSettings(
  patch: AdminSettingsPatch,
): Promise<SiteSettings> {
  const body = await authedRequest<{ data: SiteSettings }>(`/api/admin/settings`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return body.data
}

// Fetches the current YML feed XML for the preview/validation button in the
// admin settings form. Returns the raw text body rather than a JSON envelope
// because the server handler just forwards the generator's output — wrapping
// it in JSON would force double-parsing with no benefit.
export async function adminPreviewYml(): Promise<string> {
  const method = 'GET'
  const csrf = readCsrfToken()
  const headers: Record<string, string> = {}
  if (csrf) headers['X-CSRF-Token'] = csrf
  const res = await fetch(`${API_BASE}/api/admin/yml-preview`, {
    method,
    credentials: 'include',
    headers,
  })
  if (!res.ok) throw await parseError(res)
  return res.text()
}

// --- media upload ---

export async function adminUploadImage(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const csrf = readCsrfToken()
  const headers: Record<string, string> = {}
  if (csrf) headers['X-CSRF-Token'] = csrf
  // IMPORTANT: do not set content-type; the browser fills in the
  // multipart/form-data; boundary=... header itself.
  const res = await fetch(`${API_BASE}/api/admin/media/upload`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  })
  if (!res.ok) throw await parseError(res)
  const body = (await res.json()) as { data: UploadResult }
  return body.data
}

// --- revisions ---

export interface RevisionSummary {
  id: string
  entityType: 'product' | 'page' | 'product_category'
  entityId: string
  editedAt: string
  editedBy: string | null
  editorEmail: string | null
}

export async function adminListRevisions(
  entityType: 'product' | 'page' | 'product_category',
  entityId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<Paginated<RevisionSummary>> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return authedRequest<Paginated<RevisionSummary>>(
    `/api/admin/revisions/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}${qs ? `?${qs}` : ''}`,
  )
}

export async function adminRestoreRevision(id: string): Promise<void> {
  await authedRequest<{ data: unknown }>(
    `/api/admin/revisions/${encodeURIComponent(id)}/restore`,
    { method: 'POST' },
  )
}

// --- media library ---

export async function adminListMedia(
  opts: { limit?: number; offset?: number; q?: string; mimePrefix?: string } = {},
): Promise<Paginated<Media>> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  if (opts.q) params.set('q', opts.q)
  if (opts.mimePrefix) params.set('mimePrefix', opts.mimePrefix)
  const qs = params.toString()
  return authedRequest<Paginated<Media>>(
    `/api/admin/media${qs ? `?${qs}` : ''}`,
  )
}

export async function adminDeleteMedia(id: string): Promise<void> {
  await authedRequest<void>(`/api/admin/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
