import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import slugifyLib from 'slugify'
import { storage } from '../../lib/storage/index.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'
import { ApiError } from '../errors.js'

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

        res.status(200).json({
          data: {
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
