import { Router } from 'express'
import { Brackets } from 'typeorm'
import multer from 'multer'
import { AppDataSource } from '../../config/dataSource.js'
import { Redirect } from '../../entities/Redirect.js'
import {
  CreateRedirectSchema,
  UpdateRedirectSchema,
  ListQuerySchema,
} from './redirects.schemas.js'
import {
  RedirectCsvParseError,
  parseRedirectCsv,
  upsertRedirectRows,
  type ParsedRedirectCsv,
} from '../../lib/redirect-csv.js'
import { ApiError, conflict, notFound } from '../errors.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'

export const adminRedirectsRouter: Router = Router()

adminRedirectsRouter.use(requireAdminAuth)
adminRedirectsRouter.use(requireCsrfToken)

const CSV_MAX_SIZE = 5 * 1024 * 1024 // 5MB

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_MAX_SIZE },
})

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

function sortToOrderBy(sort: string): { column: string; direction: 'ASC' | 'DESC' } {
  switch (sort) {
    case 'hits_asc':
      return { column: 'r.hit_count', direction: 'ASC' }
    case 'from_asc':
      return { column: 'r.from_path', direction: 'ASC' }
    case 'hits_desc':
    default:
      return { column: 'r.hit_count', direction: 'DESC' }
  }
}

// List
adminRedirectsRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, q, sort } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Redirect)
    const { column, direction } = sortToOrderBy(sort)
    const qb = repo
      .createQueryBuilder('r')
      .orderBy(column, direction)
      // Secondary sort by created-implicit id so same-hit-count rows are
      // stable across paginated responses.
      .addOrderBy('r.id', 'ASC')
      .skip(offset)
      .take(limit)
    if (q) {
      qb.andWhere(
        new Brackets((qq) => {
          qq.where('r.from_path ILIKE :q', { q: `%${q}%` }).orWhere(
            'r.to_path ILIKE :q',
            { q: `%${q}%` },
          )
        }),
      )
    }
    const [items, total] = await qb.getManyAndCount()
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by id
adminRedirectsRouter.get('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Redirect)
    const row = await repo.findOneBy({ id: req.params.id })
    if (!row) throw notFound('redirect_not_found', 'Redirect not found')
    res.json({ data: row })
  } catch (err) {
    next(err)
  }
})

// Create
adminRedirectsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateRedirectSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Redirect)
    const entity = repo.create({ ...parsed, hitCount: 0 })
    const saved = await repo.save(entity)
    res.status(201).json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(
        conflict('from_path_conflict', 'Редирект с таким исходным путём уже существует'),
      )
      return
    }
    next(err)
  }
})

// Update
adminRedirectsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = UpdateRedirectSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Redirect)
    const existing = await repo.findOneBy({ id: req.params.id })
    if (!existing) throw notFound('redirect_not_found', 'Redirect not found')
    const merged = repo.merge(existing, parsed)
    const saved = await repo.save(merged)
    res.json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(
        conflict('from_path_conflict', 'Редирект с таким исходным путём уже существует'),
      )
      return
    }
    next(err)
  }
})

// Hard delete
adminRedirectsRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Redirect)
    const existing = await repo.findOneBy({ id: req.params.id })
    if (!existing) throw notFound('redirect_not_found', 'Redirect not found')
    await repo.delete(existing.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// CSV bulk import.
//
// Accepts a multipart upload with a `file` field containing CSV content.
// Columns: `from_path,to_path[,status_code]`. Parsing/validation and the
// upsert-by-from_path live in lib/redirect-csv.ts (shared with the
// tilda-redirects seed). Valid rows are upserted, invalid rows are collected
// into `errors`. Hit counts are preserved on update — reimporting a CSV must
// not zero historical metrics.
interface CsvImportSummary {
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

adminRedirectsRouter.post('/import-csv', (req, res, next) => {
  csvUpload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) {
      if (
        uploadErr &&
        typeof uploadErr === 'object' &&
        'code' in uploadErr &&
        (uploadErr as { code: string }).code === 'LIMIT_FILE_SIZE'
      ) {
        return next(new ApiError(400, 'file_too_large', 'File exceeds 5MB limit'))
      }
      return next(uploadErr)
    }
    ;(async () => {
      try {
        if (!req.file) {
          throw new ApiError(400, 'missing_file', 'No file uploaded')
        }
        const text = req.file.buffer.toString('utf8')
        let parsed: ParsedRedirectCsv
        try {
          parsed = parseRedirectCsv(text)
        } catch (err) {
          if (err instanceof RedirectCsvParseError) {
            throw new ApiError(400, err.code, err.message)
          }
          throw err
        }

        const repo = AppDataSource.getRepository(Redirect)
        const upsert = await upsertRedirectRows(repo, parsed.rows)

        // Merge validation and save errors back into source-file order so the
        // admin can correlate them with the uploaded CSV.
        const errors = [...parsed.errors, ...upsert.errors].sort((a, b) => a.row - b.row)
        const summary: CsvImportSummary = {
          inserted: upsert.inserted,
          updated: upsert.updated,
          skipped: errors.length,
          errors,
        }

        res.status(200).json({ data: summary })
      } catch (err) {
        next(err)
      }
    })()
  })
})
