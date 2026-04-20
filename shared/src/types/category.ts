export interface ProductCategory {
  id: string
  slug: string
  name: string
  parentId: string | null
  metaTitle: string | null
  metaDescription: string | null
  sortOrder: number
  translations: Record<string, unknown>
  // Present on admin list/get responses (count of non-deleted linked products).
  // Public/public-facing endpoints may omit this — it's purely informational.
  productCount?: number
}
