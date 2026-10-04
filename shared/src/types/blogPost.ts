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
  // Автор статьи (E-E-A-T). Блок «Об авторе» и Person в JSON-LD есть только
  // при непустом authorName; остальные поля — необязательные уточнения.
  authorName: string | null
  authorJobTitle: string | null
  authorBio: string | null
  /** Абсолютная http(s)-ссылка на профиль автора. */
  authorUrl: string | null
  authorPhotoUrl: string | null
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
