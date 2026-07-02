// Import the Tilda → shop 301-redirect map into the redirects table.
//
// Reads the committed api/data/tilda-redirects.csv (85 rows: 23 pages +
// 62 products) and upserts by from_path. Without this seed a fresh database
// has an empty redirects table and every old Tilda URL silently 404s — the
// only other way to load the map is the manual admin CSV upload.
//
// Flags:
//   --dry-run   parse + print the plan, no DB writes.
//
// The import is idempotent: rows are upserted by from_path (re-run: created 0
// / updated N) and hit_count is preserved on update. Parsing/validation and
// the upsert live in lib/redirect-csv.ts, shared with the admin CSV import.
import 'reflect-metadata'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import { parseRedirectCsv, type RedirectCsvRow } from '../lib/redirect-csv.js'

const logger = pino().child({ mod: 'import-tilda-redirects' })

// api/ package root (this file lives at api/src/seeds/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REDIRECTS_CSV_PATH = path.join(API_ROOT, 'data', 'tilda-redirects.csv')

interface CliArgs {
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false }
  for (const a of argv) {
    if (a === '--dry-run') {
      args.dryRun = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error('Usage: tsx import-tilda-redirects.ts [--dry-run]')
      process.exit(2)
    }
  }
  return args
}

async function readRedirectRows(): Promise<RedirectCsvRow[]> {
  const csv = await readFile(REDIRECTS_CSV_PATH, 'utf-8')
  const { rows, errors } = parseRedirectCsv(csv)
  if (errors.length > 0) {
    // The committed data file must be fully valid — a bad row here is a
    // repo bug, not user input. Fail loudly instead of importing a subset.
    for (const e of errors) logger.error({ row: e.row, message: e.message }, 'invalid CSV row')
    throw new Error(`${REDIRECTS_CSV_PATH} has ${errors.length} invalid row(s)`)
  }
  return rows
}

// ---- DB import ----

async function importRedirects(rows: RedirectCsvRow[]): Promise<void> {
  // Lazy-load DB modules so --dry-run works without DATABASE_URL set.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Redirect } = await import('../entities/Redirect.js')
  const { upsertRedirectRows } = await import('../lib/redirect-csv.js')

  await AppDataSource.initialize()
  try {
    const repo = AppDataSource.getRepository(Redirect)
    const summary = await upsertRedirectRows(repo, rows)
    if (summary.errors.length > 0) {
      for (const e of summary.errors) {
        logger.error({ row: e.row, message: e.message }, 'row failed to save')
      }
      throw new Error(`${summary.errors.length} row(s) failed to save`)
    }
    logger.info(
      { created: summary.inserted, updated: summary.updated, total: rows.length },
      'redirects upserted',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

function printPlan(rows: RedirectCsvRow[], args: CliArgs): void {
  const byStatus = new Map<number, number>()
  for (const r of rows) byStatus.set(r.statusCode, (byStatus.get(r.statusCode) ?? 0) + 1)
  console.log('')
  console.log('=== Tilda redirect map import ===')
  console.log(`Mode:      ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (upsert by from_path)'}`)
  console.log(`Source:    ${REDIRECTS_CSV_PATH}`)
  console.log(`Redirects: ${rows.length}`)
  for (const [status, count] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${status}  ${String(count).padStart(3)}`)
  }
  console.log('')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const rows = await readRedirectRows()
  printPlan(rows, args)

  if (args.dryRun) {
    console.log('Dry-run complete — no DB writes.')
    return
  }

  await importRedirects(rows)
  logger.info('import complete')
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
