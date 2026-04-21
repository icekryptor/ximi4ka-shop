import { z } from 'zod'

// Matches web/lib/i18n.ts. Keep them in sync manually — importing
// across workspaces adds setup cost and the list is stable.
export const SUPPORTED_LOCALES = ['ru', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

// Fields that may appear inside a per-locale translation block. Mirrors
// the columns on Product / Category / Page — every entity uses the same
// contract so the admin can share a single LanguageTabs component.
//
// All fields are optional: admins fill only what's translated.
export const TranslatableFieldsSchema = z
  .object({
    name: z.string().max(500).optional(),
    title: z.string().max(500).optional(),
    shortDescription: z.string().max(2000).nullable().optional(),
    longDescriptionBlocks: z.array(z.unknown()).optional(),
    blocks: z.array(z.unknown()).optional(),
    metaTitle: z.string().max(255).nullable().optional(),
    metaDescription: z.string().max(2000).nullable().optional(),
    slug: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  // Legacy rows stashed a `gallery` key under translations (see
  // ProductForm.tsx). Allow unknowns rather than hard-erroring on rows
  // written before Phase 8; the strict schema would reject them and
  // brick edits for existing products.
  .passthrough()

// Full translations blob — keys are locale codes, values are
// TranslatableFieldsSchema. Only non-default locales should appear; RU
// values live on the top-level entity columns.
//
// We validate the shape of every recognized locale and reject any
// locale key that isn't in SUPPORTED_LOCALES. Legacy non-locale keys
// (e.g. `gallery` from older product forms) are allowed to passthrough
// so editing pre-Phase-8 products doesn't 400. New writes shouldn't
// add them; the admin forms produce clean { en: {...} } blocks now.
const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES)
const LEGACY_PRESERVED_KEYS = new Set<string>(['gallery'])

export const TranslationsSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (LOCALE_SET.has(key)) {
        const parsed = TranslatableFieldsSchema.safeParse(value[key])
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            ctx.addIssue({ ...issue, path: [key, ...(issue.path ?? [])] })
          }
        }
        continue
      }
      if (LEGACY_PRESERVED_KEYS.has(key)) continue
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `Unsupported locale key: ${key}`,
      })
    }
  })
  .optional()
