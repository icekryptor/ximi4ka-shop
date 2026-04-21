import { z } from 'zod'
import { TranslationsSchema } from './i18n.js'

export const CreateProductSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  sku: z.string().max(64).nullable().optional(),
  name: z.string().min(1).max(500),
  shortDescription: z.string().max(2000).nullable().optional(),
  longDescriptionBlocks: z.array(z.unknown()).default([]),
  priceRub: z.number().int().nonnegative(),
  compareAtPriceRub: z.number().int().nonnegative().nullable().optional(),
  stockStatus: z.enum(['in_stock', 'out_of_stock', 'preorder']).default('in_stock'),
  sortOrder: z.number().int().default(0),
  metaTitle: z.string().max(255).nullable().optional(),
  metaDescription: z.string().max(2000).nullable().optional(),
  ogImage: z.string().max(500).nullable().optional(),
  canonicalUrl: z.string().max(500).nullable().optional(),
  noindex: z.boolean().default(false),
  translations: TranslationsSchema.default({}),
})

export const UpdateProductSchema = CreateProductSchema.partial()

export const ListQuerySchema = z.object({
  // Admin listing is paginated; feed-style bulk reads use the public
  // endpoint which raises this cap separately.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(100).optional(),
})

// Public listing accepts a much larger limit because external consumers
// (YML feed, sitemap, Turbo RSS) enumerate the full catalog. 5000 is
// generous for the foreseeable catalog size without risking runaway memory.
export const PublicListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  // Opt-in relation loader. `categories` triggers a left-join on the
  // product_category_links table and returns a `categoryIds` string[] on
  // each row. Comma-separated to keep room for future `include` targets
  // (e.g. `images`), though images are already eager-loaded elsewhere.
  include: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
})
