import path from 'node:path'
import fs from 'node:fs'
import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import slugifyLib from 'slugify'
import { z } from 'zod'
import { AppDataSource } from '../../config/dataSource.js'
import { Media } from '../../entities/Media.js'
import { storage, UPLOADS_DIR } from '../../lib/storage/index.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'
import { ApiError, notFound } from '../errors.js'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
})

export const mediaRouter: Router = Router()
mediaRouter.use(requireAdminAuth)
mediaRouter.use(requireCsrfToken)

mediaRouter.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) {
      if (
        uploadErr &&
        typeof uploadErr === 'object' &&
        'code' in uploadErr &&
        (uploadErr as { code: string }).code === 'LIMIT_FILE_SIZE'
      ) {
        return next(
          new ApiError(400, 'file_too_large', 'File exceeds 10MB limit'),
        )
      }
      return next(uploadErr)
    }
    ;(async () => {
      try {
        if (!req.file) {
          throw new ApiError(400, 'missing_file', 'No file uploaded')
        }
        if (!ALLOWED_MIME.has(req.file.mimetype)) {
          throw new ApiError(
            400,
            'invalid_file_type',
            `Unsupported MIME: ${req.file.mimetype}`,
          )
        }

        const meta = await sharp(req.file.buffer).metadata()

        const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg')
        // multer decodes the multipart filename as latin1 by default; the
        // browser sends UTF-8. Round-trip to recover Cyrillic, emoji, etc.
        // See: https://github.com/expressjs/multer/issues/1104
        const rawName = Buffer.from(req.file.originalname, 'latin1').toString(
          'utf8',
        )
        const base = rawName.replace(/\.[^.]+$/, '')
        const slug =
          slugifyLib(base, { lower: true, strict: true, locale: 'ru' }) ||
          'image'
        const saved = await storage.save({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          slug: `${slug}.${ext}`,
        })

        const mediaRepo = AppDataSource.getRepository(Media)
        const row = mediaRepo.create({
          url: saved.url,
          filename: saved.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          width: meta.width ?? null,
          height: meta.height ?? null,
          uploadedBy: req.adminUser?.id ?? null,
        })
        const persisted = await mediaRepo.save(row)

        res.status(200).json({
          data: {
            id: persisted.id,
            url: saved.url,
            filename: saved.filename,
            size: req.file.size,
            width: meta.width,
            height: meta.height,
            mimeType: req.file.mimetype,
          },
        })
      } catch (err) {
        next(err)
      }
    })()
  })
})

// List recent uploads. Newest first, paginated. Filter by filename substring
// (q) and/or mime-type prefix (mimePrefix, e.g. "image/").
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(100).optional(),
  mimePrefix: z.string().trim().min(1).max(30).optional(),
})

mediaRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, q, mimePrefix } = ListQuerySchema.parse(req.query)
    const qb = AppDataSource.getRepository(Media).createQueryBuilder('m')
    if (q) qb.andWhere('m.filename ILIKE :q', { q: `%${q}%` })
    if (mimePrefix) qb.andWhere('m.mime_type LIKE :mp', { mp: `${mimePrefix}%` })
    qb.orderBy('m.created_at', 'DESC').skip(offset).take(limit)
    const [items, total] = await qb.getManyAndCount()
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Hard delete: remove the row and the underlying file. Intentionally does
// NOT check references (product.ogImage, page blocks) — admins delete at
// their own risk. A future task can add reference-tracking.
mediaRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Media)
    const media = await repo.findOneBy({ id: req.params.id })
    if (!media) throw notFound('media_not_found', 'Media not found')

    // Delete file from disk first; tolerate missing file (log + continue) so
    // the DB row still gets cleaned up and we don't leave an orphan row
    // pointing at nothing. Other unlink errors log but proceed to DB delete.
    const diskPath = path.join(
      UPLOADS_DIR,
      media.url.replace(/^\/uploads\//, ''),
    )
    try {
      await fs.promises.unlink(diskPath)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn('failed to unlink media file', diskPath, err)
      }
    }

    await repo.delete(media.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
