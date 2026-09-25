import type { ShippingBox } from './shipping.js'

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
  metaTitle: string | null
  metaDescription: string | null
  ogImage: string | null
  canonicalUrl: string | null
  noindex: boolean
  translations: Record<string, unknown>
  // Данные для доставки. Необязательны в типе, чтобы фикстуры витрины не
  // обязаны были их знать; API отдаёт их всегда.
  weightG?: number | null
  shipBoxes?: ShippingBox[]
  looseUnits?: number
  minBox?: ShippingBox | null
  images: ProductImage[]
  createdAt: string
  updatedAt: string
}
