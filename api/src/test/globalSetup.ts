// Vitest global setup: provision the isolated test database.
//
// API suites TRUNCATE tables between cases, so they must never run against
// the dev database (DATABASE_URL). config/dataSource.ts resolves
// TEST_DATABASE_URL (default postgres://localhost:5432/ximi4ka_shop_test)
// whenever VITEST is set; this setup creates that database if it doesn't
// exist yet and brings its schema up to date by running all TypeORM
// migrations. Re-runs are cheap: applied migrations are tracked in the
// "migrations" table.
import 'reflect-metadata'
import pg from 'pg'
import { AppDataSource, databaseUrl } from '../config/dataSource.js'

async function ensureDatabaseExists(testUrl: URL, dbName: string): Promise<void> {
  // CREATE DATABASE can't run inside the target database — connect to the
  // maintenance database `postgres` on the same server instead.
  const adminUrl = new URL(testUrl.href)
  adminUrl.pathname = '/postgres'
  const client = new pg.Client({ connectionString: adminUrl.href })
  await client.connect()
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ])
    if (existing.rowCount === 0) {
      // Identifiers can't be parameterized; dbName comes from our own config,
      // but escape double quotes defensively anyway.
      await client.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`)
    }
  } finally {
    await client.end()
  }
}

export default async function globalSetup(): Promise<void> {
  const testUrl = new URL(databaseUrl)
  const dbName = decodeURIComponent(testUrl.pathname.replace(/^\//, ''))

  // Belt and braces: refuse to run destructive suites against anything that
  // isn't clearly a test database (e.g. TEST_DATABASE_URL mistakenly pointed
  // at the dev database).
  if (!dbName.includes('test')) {
    throw new Error(
      `refusing to run tests against database "${dbName}" — the name must contain "test". ` +
        'Point TEST_DATABASE_URL at a dedicated test database.',
    )
  }

  await ensureDatabaseExists(testUrl, dbName)

  await AppDataSource.initialize()
  try {
    await AppDataSource.runMigrations()
  } finally {
    await AppDataSource.destroy()
  }
}
