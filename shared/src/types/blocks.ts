export interface ParagraphBlock {
  type: 'paragraph'
  /** Sanitized HTML produced by the admin editor (Tiptap output). */
  html: string
}

export interface ImageBlock {
  type: 'image'
  url: string
  alt: string
  caption?: string | null
  width?: number | null
  height?: number | null
}

export interface GalleryBlock {
  type: 'gallery'
  images: Array<{ url: string; alt: string }>
}

export type LayoutVariant =
  | 'text-left'
  | 'text-right'
  | 'text-top'
  | 'text-bottom'
  | 'overlay'

export interface LayoutBlock {
  type: 'layout'
  variant: LayoutVariant
  text: { html: string }
  image: { url: string; alt: string }
}

export interface CtaBlock {
  type: 'cta'
  heading: string
  subtext?: string | null
  buttonLabel: string
  buttonHref: string
}

export type VideoProvider = 'youtube' | 'vk' | 'rutube'

export interface VideoBlock {
  type: 'video'
  provider: VideoProvider
  /**
   * Video identifier. For YouTube and Rutube this is the bare id; for VK
   * this should be the full query string suffix after `video_ext.php?`
   * (VK embeds use a compound oid/id pair).
   */
  videoId: string
  title?: string | null
}

export interface FaqItem {
  question: string
  answer: string
}

export interface FaqBlock {
  type: 'faq'
  items: FaqItem[]
}

export interface ProductGridBlock {
  type: 'product_grid'
  productSlugs: string[]
  heading?: string | null
}

export type Block =
  | ParagraphBlock
  | ImageBlock
  | GalleryBlock
  | LayoutBlock
  | CtaBlock
  | VideoBlock
  | FaqBlock
  | ProductGridBlock

export type BlockType = Block['type']

/**
 * Runtime type guard for JSONB-sourced block values.
 * We can't trust the DB shape at read-time, so filter through this before
 * dispatching to renderers.
 */
export function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  if (typeof type !== 'string') return false
  return (
    type === 'paragraph' ||
    type === 'image' ||
    type === 'gallery' ||
    type === 'layout' ||
    type === 'cta' ||
    type === 'video' ||
    type === 'faq' ||
    type === 'product_grid'
  )
}
