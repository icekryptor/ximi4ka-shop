// Shared CSV parsing/validation and upsert logic for redirect imports.
//
// Two consumers:
//   - the admin bulk-import endpoint (routes/admin/redirects.ts,
//     POST /api/admin/redirects/import-csv);
//   - the Tilda redirect-map seed (seeds/import-tilda-redirects.ts).
//
// CSV format: `from_path,to_path[,status_code]`, with an optional header row
// using those exact column names. Each row is validated independently; a bad
// row never blocks the rest of the file.
import { parse as parseCsvSync } from 'csv-parse/sync'
import type { Repository } from 'typeorm'
import type { Redirect } from '../entities/Redirect.js'
import { isReservedPath } from '../routes/admin/redirects.schemas.js'

export const ALLOWED_REDIRECT_STATUS_CODES = new Set([301, 302, 307, 308])

export interface RedirectCsvRow {
  /** 1-based line number in the source CSV, for error reporting. */
  row: number
  fromPath: string
  toPath: string
  statusCode: number
}

export interface RedirectCsvError {
  row: number
  message: string
}

export interface ParsedRedirectCsv {
  rows: RedirectCsvRow[]
  errors: RedirectCsvError[]
}

// File-level failures (as opposed to row-level ones, which are collected in
// ParsedRedirectCsv.errors). `code` doubles as the API error code in the
// admin endpoint.
export class RedirectCsvParseError extends Error {
  constructor(
    public readonly code: 'empty_csv' | 'csv_parse_error',
    message: string,
  ) {
    super(message)
    this.name = 'RedirectCsvParseError'
  }
}

export function parseRedirectCsv(input: string): ParsedRedirectCsv {
  const text = input.trim()
  if (!text) {
    throw new RedirectCsvParseError('empty_csv', 'CSV is empty')
  }

  // csv-parse with columns: false returns string[][] so we can detect and
  // skip a header row ourselves. We intentionally DON'T use `columns: true`
  // because that throws on missing columns — we'd rather record per-row
  // errors and continue.
  let records: string[][]
  try {
    records = parseCsvSync(text, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as string[][]
  } catch (parseErr) {
    const message = parseErr instanceof Error ? parseErr.message : 'CSV parse failed'
    throw new RedirectCsvParseError('csv_parse_error', message)
  }

  if (records.length === 0) {
    throw new RedirectCsvParseError('empty_csv', 'CSV is empty')
  }

  // Detect and drop an optional header row. The spec allows (and encourages)
  // `from_path,to_path,status_code` as the first row.
  let startIndex = 0
  const firstLower = records[0]!.map((c) => c.toLowerCase())
  if (firstLower[0] === 'from_path' && firstLower[1] === 'to_path') {
    startIndex = 1
  }

  const rows: RedirectCsvRow[] = []
  const errors: RedirectCsvError[] = []

  for (let i = startIndex; i < records.length; i++) {
    // Display row number is 1-based and counts the raw CSV line, so errors
    // can be correlated with the source file.
    const rowNum = i + 1
    const record = records[i]!
    const fromPath = (record[0] ?? '').trim()
    const toPath = (record[1] ?? '').trim()
    const statusRaw = (record[2] ?? '').trim()

    if (!fromPath || !toPath) {
      errors.push({ row: rowNum, message: 'from_path и to_path обязательны' })
      continue
    }
    if (!fromPath.startsWith('/')) {
      errors.push({ row: rowNum, message: 'from_path должен начинаться с /' })
      continue
    }
    if (isReservedPath(fromPath)) {
      errors.push({
        row: rowNum,
        message: 'from_path не может начинаться с /admin, /api, /uploads или /_next',
      })
      continue
    }
    if (fromPath.length > 1000 || toPath.length > 1000) {
      errors.push({ row: rowNum, message: 'Путь не может быть длиннее 1000 символов' })
      continue
    }
    let statusCode = 301
    if (statusRaw) {
      const parsedStatus = Number.parseInt(statusRaw, 10)
      if (!Number.isFinite(parsedStatus) || !ALLOWED_REDIRECT_STATUS_CODES.has(parsedStatus)) {
        errors.push({ row: rowNum, message: 'status_code должен быть 301, 302, 307 или 308' })
        continue
      }
      statusCode = parsedStatus
    }

    rows.push({ row: rowNum, fromPath, toPath, statusCode })
  }

  return { rows, errors }
}

export interface RedirectUpsertSummary {
  inserted: number
  updated: number
  errors: RedirectCsvError[]
}

// Upserts validated rows by from_path. hit_count is intentionally preserved
// on update — reimporting must not zero historical metrics. Row-level save
// failures are collected into `errors`, not thrown.
export async function upsertRedirectRows(
  repo: Repository<Redirect>,
  rows: RedirectCsvRow[],
): Promise<RedirectUpsertSummary> {
  const summary: RedirectUpsertSummary = { inserted: 0, updated: 0, errors: [] }

  for (const row of rows) {
    try {
      const existing = await repo.findOneBy({ fromPath: row.fromPath })
      if (existing) {
        existing.toPath = row.toPath
        existing.statusCode = row.statusCode
        // hit_count is intentionally preserved on re-import.
        await repo.save(existing)
        summary.updated++
      } else {
        await repo.save(
          repo.create({
            fromPath: row.fromPath,
            toPath: row.toPath,
            statusCode: row.statusCode,
            hitCount: 0,
          }),
        )
        summary.inserted++
      }
    } catch (rowErr) {
      const message = rowErr instanceof Error ? rowErr.message : 'Не удалось сохранить строку'
      summary.errors.push({ row: row.row, message })
    }
  }

  return summary
}
