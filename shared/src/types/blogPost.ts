// Blog post as serialized by the public API (`/api/public/blog`).
// Mirrors the Page CMS shape (blocks + SEO + translations + publish flag)
// with three editorial extras: excerpt, cover image and rubric.
// `publishedAt` is set on first publish and drives listing order.
export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverImageUrl: string | null
  rubric: string | null
  blocks: unknown[]
  metaTitle: string | null
  metaDescription: string | null
  ogImage: string | null
  canonicalUrl: string | null
  noindex: boolean
  translations: Record<string, unknown>
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}
