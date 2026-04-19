export interface Page {
  id: string
  slug: string
  title: string
  blocks: unknown[]
  metaTitle: string | null
  metaDescription: string | null
  ogImage: string | null
  canonicalUrl: string | null
  noindex: boolean
  translations: Record<string, unknown>
  isPublished: boolean
  createdAt: string
  updatedAt: string
}
