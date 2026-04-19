import { z } from 'zod'

export const CreateCategorySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
  metaTitle: z.string().max(255).nullable().optional(),
  metaDescription: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().default(0),
  translations: z.record(z.string(), z.unknown()).default({}),
})

export const UpdateCategorySchema = CreateCategorySchema.partial()

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
