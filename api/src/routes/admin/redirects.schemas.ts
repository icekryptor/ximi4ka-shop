import { z } from 'zod'

// Paths in this set cover Next's internals, API passthrough, static uploads,
// and the admin panel itself. Creating a redirect whose `from_path` matches
// any of them would either never fire (middleware excludes them) or break
// the admin panel, so we reject them at validation time with a clear
// Russian-language message instead of failing silently later.
const RESERVED_PREFIXES = ['/admin', '/api', '/uploads', '/_next']

function isReservedPath(value: string): boolean {
  return RESERVED_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(`${prefix}/`),
  )
}

const fromPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .regex(/^\//, 'Путь должен начинаться с /')
  .refine(
    (value) => !isReservedPath(value),
    'Путь не может начинаться с /admin, /api, /uploads или /_next',
  )

const toPathSchema = z.string().trim().min(1).max(1000)

const statusCodeSchema = z
  .number()
  .int()
  .refine(
    (n) => [301, 302, 307, 308].includes(n),
    'Код должен быть одним из: 301, 302, 307, 308',
  )

export const CreateRedirectSchema = z.object({
  fromPath: fromPathSchema,
  toPath: toPathSchema,
  statusCode: statusCodeSchema.default(301),
})

export const UpdateRedirectSchema = z.object({
  fromPath: fromPathSchema.optional(),
  toPath: toPathSchema.optional(),
  statusCode: statusCodeSchema.optional(),
})

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['hits_desc', 'hits_asc', 'from_asc']).default('hits_desc'),
})

export { isReservedPath }
