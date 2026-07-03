// Data contract for the committed Tilda redirect map consumed by
// seeds/import-tilda-redirects.ts: every row must be valid (the seed refuses
// to import a subset) and from_path must be unique (upsert key).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseRedirectCsv } from '../lib/redirect-csv.js'

const REDIRECTS_CSV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/tilda-redirects.csv',
)

describe('data/tilda-redirects.csv', () => {
  it('parses cleanly: 84 valid 301 rows, unique from_path', async () => {
    const csv = await readFile(REDIRECTS_CSV_PATH, 'utf-8')
    const { rows, errors } = parseRedirectCsv(csv)

    expect(errors).toEqual([])
    expect(rows).toHaveLength(84)
    expect(rows.every((r) => r.statusCode === 301)).toBe(true)
    expect(rows.every((r) => r.fromPath.startsWith('/') && r.toPath.startsWith('/'))).toBe(
      true,
    )

    const fromPaths = new Set(rows.map((r) => r.fromPath))
    expect(fromPaths.size).toBe(rows.length)
  })
})
