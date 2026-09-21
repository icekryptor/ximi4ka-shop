import { z } from 'zod'
import { TranslationsSchema } from './i18n.js'

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
  translations: TranslationsSchema.default({}),
})

export const UpdateCategorySchema = CreateCategorySchema.partial()

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

// Публичное дерево категорий читают фиды (yml.xml, turbo.xml, sitemap): им
// нужен весь список разом, с запасом на рост каталога. Потолок как у
// PublicListQuerySchema товаров — с админским в 100 фид получал 400 и
// сваливался в catch, отдавая Яндексу пустой каталог.
export const PublicListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
