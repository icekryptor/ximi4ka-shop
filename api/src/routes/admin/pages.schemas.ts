import { z } from 'zod'

export const CreatePageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  title: z.string().min(1).max(500),
  blocks: z.array(z.unknown()).default([]),
  metaTitle: z.string().max(255).nullable().optional(),
  metaDescription: z.string().max(2000).nullable().optional(),
  ogImage: z.string().max(255).nullable().optional(),
  canonicalUrl: z.string().max(500).nullable().optional(),
  noindex: z.boolean().default(false),
  translations: z.record(z.string(), z.unknown()).default({}),
})

export const UpdatePageSchema = CreatePageSchema.partial()

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(100).optional(),
})
