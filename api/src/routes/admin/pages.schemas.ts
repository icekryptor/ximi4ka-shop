import { z } from 'zod'
import { TranslationsSchema } from './i18n.js'

export const CreatePageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    // «_» нужен для URL, перенесённых с Tilda 1:1 (xim3_inst, get_materials):
    // без него админка не сохранила бы правку такой страницы.
    .regex(/^[a-z0-9_-]+$/, 'slug must be lowercase kebab-case (underscore allowed)'),
  title: z.string().min(1).max(500),
  blocks: z.array(z.unknown()).default([]),
  metaTitle: z.string().max(255).nullable().optional(),
  metaDescription: z.string().max(2000).nullable().optional(),
  ogImage: z.string().max(255).nullable().optional(),
  canonicalUrl: z.string().max(500).nullable().optional(),
  noindex: z.boolean().default(false),
  translations: TranslationsSchema.default({}),
})

export const UpdatePageSchema = CreatePageSchema.partial()

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(100).optional(),
})
