export type StockStatus = 'in_stock' | 'out_of_stock' | 'preorder'

export interface ProductImage {
  id: string
  productId: string
  url: string
  alt: string
  sortOrder: number
}

export interface Product {
  id: string
  slug: string
  sku: string | null
  name: string
  shortDescription: string | null
  longDescriptionBlocks: unknown[]
  priceRub: number
  compareAtPriceRub: number | null
  stockStatus: StockStatus
  isPublished: boolean
  sortOrder: number
  images: ProductImage[]
  createdAt: string
  updatedAt: string
}
