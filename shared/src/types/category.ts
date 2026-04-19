export interface ProductCategory {
  id: string
  slug: string
  name: string
  parentId: string | null
  metaTitle: string | null
  metaDescription: string | null
  sortOrder: number
  translations: Record<string, unknown>
}
