import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalDiskStorage } from './LocalDiskStorage.js'

export interface SavedFile {
  url: string
  filename: string
}

export interface StorageAdapter {
  save(args: { buffer: Buffer; mimeType: string; slug: string }): Promise<SavedFile>
}

// Resolve api/uploads relative to this module's location rather than
// process.cwd(). npm workspace scripts (`npm run dev -w api`) run with
// cwd=api/, while ad-hoc launches may use the repo root — using __dirname
// keeps behavior consistent in both cases.
const thisDir = path.dirname(fileURLToPath(import.meta.url))
// src/lib/storage/ → src/lib/ → src/ → api/. +/uploads.
export const UPLOADS_DIR = path.resolve(thisDir, '../../..', 'uploads')

export const storage: StorageAdapter = new LocalDiskStorage(UPLOADS_DIR)

export { LocalDiskStorage }
