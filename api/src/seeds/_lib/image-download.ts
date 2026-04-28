import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface DownloadedImage {
  // The public URL path served by api/src/app.ts at /uploads/...
  publicUrl: string
  // Absolute on-disk path the file was written to.
  diskPath: string
  // Source URL we fetched.
  sourceUrl: string
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const ext = path.extname(u.pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext
    }
    return null
  } catch {
    return null
  }
}

async function downloadOne(
  sourceUrl: string,
  outDir: string,
  publicDirSegment: string,
  index: number,
): Promise<DownloadedImage> {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${sourceUrl}`)
  }
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? extFromUrl(sourceUrl) ?? '.png'
  const buf = Buffer.from(await res.arrayBuffer())

  const filename = `${index}${ext}`
  const diskPath = path.join(outDir, filename)
  await writeFile(diskPath, buf)

  const publicUrl = `/uploads/${publicDirSegment}/${filename}`
  return { publicUrl, diskPath, sourceUrl }
}

// Downloads `urls` into `<uploadsRoot>/imported/<slug>/<index>.<ext>` with a
// concurrency cap. Failures are logged via `onError` and skipped — we never
// abort the whole import for a single bad image.
export async function downloadImages(args: {
  urls: string[]
  slug: string
  uploadsRoot: string
  concurrency?: number
  onError?: (sourceUrl: string, err: unknown) => void
}): Promise<DownloadedImage[]> {
  const { urls, slug, uploadsRoot, concurrency = 5, onError } = args
  if (urls.length === 0) return []

  const dirSegment = `imported/${slug}`
  const outDir = path.join(uploadsRoot, 'imported', slug)
  await mkdir(outDir, { recursive: true })

  const results: Array<DownloadedImage | null> = new Array(urls.length).fill(null)

  let cursor = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= urls.length) return
      const u = urls[i]!
      try {
        results[i] = await downloadOne(u, outDir, dirSegment, i)
      } catch (err) {
        if (onError) onError(u, err)
        results[i] = null
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  await Promise.all(workers)

  return results.filter((r): r is DownloadedImage => r !== null)
}
