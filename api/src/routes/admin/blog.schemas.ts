import { z } from 'zod'
import { TranslationsSchema } from './i18n.js'

// Mirrors pages.schemas.ts with the blog editorial extras (excerpt, cover
// image, rubric). Publish state is NOT accepted here — it changes only
// through the dedicated /publish and /unpublish endpoints, which also own
// the published_at bookkeeping.
export const CreateBlogPostSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  title: z.string().min(1).max(500),
  excerpt: z.string().max(2000).nullable().optional(),
  coverImageUrl: z.string().max(500).nullable().optional(),
  rubric: z.string().max(255).nullable().optional(),
  blocks: z.array(z.unknown()).default([]),
  metaTitle: z.string().max(255).nullable().optional(),
  metaDescription: z.string().max(2000).nullable().optional(),
  ogImage: z.string().max(500).nullable().optional(),
  canonicalUrl: z.string().max(500).nullable().optional(),
  noindex: z.boolean().default(false),
  translations: TranslationsSchema.default({}),
})

export const UpdateBlogPostSchema = CreateBlogPostSchema.partial()

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(100).optional(),
})
