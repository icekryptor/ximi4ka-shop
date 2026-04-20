import { Router } from 'express'
import { Brackets } from 'typeorm'
import multer from 'multer'
import { parse as parseCsvSync } from 'csv-parse/sync'
import { AppDataSource } from '../../config/dataSource.js'
import { Redirect } from '../../entities/Redirect.js'
import {
  CreateRedirectSchema,
  UpdateRedirectSchema,
  ListQuerySchema,
  isReservedPath,
} from './redirects.schemas.js'
import { ApiError, conflict, notFound } from '../errors.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'

export const adminRedirectsRouter: Router = Router()

adminRedirectsRouter.use(requireAdminAuth)
adminRedirectsRouter.use(requireCsrfToken)

const CSV_MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_STATUS_CODES = new Set([301, 302, 307, 308])

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
// Columns: `from_path,to_path[,status_code]`. If the first row looks like
// a header (matches those exact column names) it's skipped. Each row is
// validated independently; valid rows are upserted on `from_path` (INSERT
// or UPDATE of `to_path` + `status_code`), invalid rows are collected into
// `errors`. Hit counts are preserved on update — reimporting a CSV must not
// zero historical metrics.
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
        const text = req.file.buffer.toString('utf8').trim()
        if (!text) {
          throw new ApiError(400, 'empty_csv', 'CSV is empty')
        }

        // Parse once; csv-parse/sync returns string[][] with columns: false
        // so we can detect and skip a header row ourselves. We intentionally
        // DON'T use `columns: true` because that throws on missing columns —
        // we'd rather record per-row errors and continue.
        let records: string[][]
        try {
          records = parseCsvSync(text, {
            columns: false,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
          }) as string[][]
        } catch (parseErr) {
          const message =
            parseErr instanceof Error ? parseErr.message : 'CSV parse failed'
          throw new ApiError(400, 'csv_parse_error', message)
        }

        if (records.length === 0) {
          throw new ApiError(400, 'empty_csv', 'CSV is empty')
        }

        // Detect and drop an optional header row. The spec allows (and
        // encourages) `from_path,to_path,status_code` as the first row.
        let startIndex = 0
        const first = records[0]
        const firstLower = first.map((c) => c.toLowerCase())
        if (
          firstLower[0] === 'from_path' &&
          firstLower[1] === 'to_path'
        ) {
          startIndex = 1
        }

        const summary: CsvImportSummary = {
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: [],
        }

        const repo = AppDataSource.getRepository(Redirect)

        for (let i = startIndex; i < records.length; i++) {
          // Display row number is 1-based and counts the raw CSV line, so the
          // admin can correlate errors with the source file.
          const rowNum = i + 1
          const row = records[i]
          const fromPath = (row[0] ?? '').trim()
          const toPath = (row[1] ?? '').trim()
          const statusRaw = (row[2] ?? '').trim()

          if (!fromPath || !toPath) {
            summary.skipped++
            summary.errors.push({
              row: rowNum,
              message: 'from_path и to_path обязательны',
            })
            continue
          }
          if (!fromPath.startsWith('/')) {
            summary.skipped++
            summary.errors.push({
              row: rowNum,
              message: 'from_path должен начинаться с /',
            })
            continue
          }
          if (isReservedPath(fromPath)) {
            summary.skipped++
            summary.errors.push({
              row: rowNum,
              message: 'from_path не может начинаться с /admin, /api, /uploads или /_next',
            })
            continue
          }
          if (fromPath.length > 1000 || toPath.length > 1000) {
            summary.skipped++
            summary.errors.push({
              row: rowNum,
              message: 'Путь не может быть длиннее 1000 символов',
            })
            continue
          }
          let statusCode = 301
          if (statusRaw) {
            const parsedStatus = Number.parseInt(statusRaw, 10)
            if (!Number.isFinite(parsedStatus) || !ALLOWED_STATUS_CODES.has(parsedStatus)) {
              summary.skipped++
              summary.errors.push({
                row: rowNum,
                message: 'status_code должен быть 301, 302, 307 или 308',
              })
              continue
            }
            statusCode = parsedStatus
          }

          try {
            const existing = await repo.findOneBy({ fromPath })
            if (existing) {
              existing.toPath = toPath
              existing.statusCode = statusCode
              // hit_count is intentionally preserved on re-import.
              await repo.save(existing)
              summary.updated++
            } else {
              const created = repo.create({
                fromPath,
                toPath,
                statusCode,
                hitCount: 0,
              })
              await repo.save(created)
              summary.inserted++
            }
          } catch (rowErr) {
            summary.skipped++
            const msg =
              rowErr instanceof Error ? rowErr.message : 'Не удалось сохранить строку'
            summary.errors.push({ row: rowNum, message: msg })
          }
        }

        res.status(200).json({ data: summary })
      } catch (err) {
        next(err)
      }
    })()
  })
})
