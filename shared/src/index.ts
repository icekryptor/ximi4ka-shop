export type {
  OrderDto,
  OrderItem,
  OrderItemSnapshot,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentProvider,
  DeliveryAddress,
  DeliveryMethod,
  CheckoutRequest,
  CheckoutResponse,
  PublicOrderStatus,
} from './types/order.js'

export type { Product, ProductImage, StockStatus } from './types/product.js'

export type { ProductCategory } from './types/category.js'

export type { Page } from './types/page.js'

export type { BlogPost } from './types/blogPost.js'

export type {
  SearchResult,
  SearchProductResult,
  SearchPostResult,
} from './types/search.js'

export type {
  Block,
  BlockType,
  ParagraphBlock,
  ImageBlock,
  GalleryBlock,
  LayoutBlock,
  LayoutVariant,
  CtaBlock,
  VideoBlock,
  VideoProvider,
  FaqBlock,
  FaqItem,
  ProductGridBlock,
} from './types/blocks.js'
// Note: isBlock (runtime export) is NOT re-exported here because shared/ emits no
// JS (noEmit: true). Next.js's bundler can't resolve runtime re-exports from a
// TS-only source. Consumers should import it directly:
//   import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
