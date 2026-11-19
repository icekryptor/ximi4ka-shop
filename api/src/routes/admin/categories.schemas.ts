import { z } from 'zod'
import { TranslationsSchema } from './i18n.js'

// Базовые поля без значений по умолчанию. В zod 4 `.default()` срабатывает
// и после `.partial()`, поэтому схема PATCH строится отсюда: иначе PATCH одного
// поля сбрасывал sortOrder и переводы к значениям по умолчанию.
const CategoryBaseSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
  metaTitle: z.string().max(255).nullable().optional(),
  metaDescription: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int(),
  // Как blocks у страниц и статей: форма блоков проверяется при выводе (isBlock).
  seoBlocks: z.array(z.unknown()).nullable().optional(),
  translations: TranslationsSchema,
})

export const CreateCategorySchema = CategoryBaseSchema.extend({
  sortOrder: CategoryBaseSchema.shape.sortOrder.default(0),
  translations: CategoryBaseSchema.shape.translations.default({}),
})

export const UpdateCategorySchema = CategoryBaseSchema.partial()

// Админка читает все категории одним запросом (?limit=200 — страницы
// категорий и фильтр в списке товаров). С потолком 100 такой запрос получал 400.
export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
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
