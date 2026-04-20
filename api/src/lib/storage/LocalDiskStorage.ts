import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import type { SavedFile, StorageAdapter } from './index.js'

// Writes files to disk under <base>/<YYYY>/<MM>/<slug>.
// Returns a public URL path like /uploads/<YYYY>/<MM>/<file>, which matches
// the express.static mount in app.ts. Collisions on the final filename get a
// short random suffix so we never overwrite.
export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  async save({
    buffer,
    slug,
  }: {
    buffer: Buffer
    mimeType: string
    slug: string
  }): Promise<SavedFile> {
    const now = new Date()
    const yyyy = String(now.getUTCFullYear())
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    const dir = path.join(this.baseDir, yyyy, mm)
    await mkdir(dir, { recursive: true })

    const ext = path.extname(slug)
    const stem = slug.slice(0, slug.length - ext.length)
    let filename = slug
    let fullPath = path.join(dir, filename)

    // If a file with the same name already exists, tag on a short suffix.
    // The loop is paranoid against the (astronomically unlikely) suffix
    // collision; in practice it terminates on the first try.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await fileExists(fullPath))) break
      const suffix = randomBytes(4).toString('hex')
      filename = `${stem}-${suffix}${ext}`
      fullPath = path.join(dir, filename)
    }

    await writeFile(fullPath, buffer)

    const url = `/uploads/${yyyy}/${mm}/${filename}`
    return { url, filename }
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}
