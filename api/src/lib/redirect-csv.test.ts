import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Redirect } from '../entities/Redirect.js'
import {
  RedirectCsvParseError,
  parseRedirectCsv,
  upsertRedirectRows,
} from './redirect-csv.js'

describe('parseRedirectCsv', () => {
  it('parses rows, skipping the header and defaulting status_code to 301', () => {
    const csv = ['from_path,to_path,status_code', '/a,/x,302', '/b,/y'].join('\n')
    const { rows, errors } = parseRedirectCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { row: 2, fromPath: '/a', toPath: '/x', statusCode: 302 },
      { row: 3, fromPath: '/b', toPath: '/y', statusCode: 301 },
    ])
  })

  it('treats the first row as data when there is no header', () => {
    const { rows, errors } = parseRedirectCsv('/a,/x,301')
    expect(errors).toEqual([])
    expect(rows).toEqual([{ row: 1, fromPath: '/a', toPath: '/x', statusCode: 301 }])
  })

  it('collects per-row errors but keeps valid rows', () => {
    const csv = [
      'from_path,to_path,status_code',
      '/good,/x,301',
      // missing to_path
      '/bad,,301',
      // does not start with /
      'oops,/y,301',
      // reserved prefix
      '/admin/panel,/y,301',
      // invalid status code
      '/worse,/y,999',
    ].join('\n')
    const { rows, errors } = parseRedirectCsv(csv)
    expect(rows).toEqual([{ row: 2, fromPath: '/good', toPath: '/x', statusCode: 301 }])
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6])
  })

  it('rejects paths longer than 1000 characters', () => {
    const long = `/${'a'.repeat(1000)}`
    const { rows, errors } = parseRedirectCsv(`${long},/x,301`)
    expect(rows).toEqual([])
    expect(errors).toHaveLength(1)
  })

  it('throws RedirectCsvParseError(empty_csv) for empty or blank input', () => {
    for (const input of ['', '   \n  ']) {
      let thrown: unknown
      try {
        parseRedirectCsv(input)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(RedirectCsvParseError)
      expect((thrown as RedirectCsvParseError).code).toBe('empty_csv')
    }
  })
})

describe('upsertRedirectRows', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE redirects RESTART IDENTITY CASCADE')
  })

  it('inserts new rows', async () => {
    const repo = AppDataSource.getRepository(Redirect)
    const summary = await upsertRedirectRows(repo, [
      { row: 1, fromPath: '/a', toPath: '/x', statusCode: 301 },
      { row: 2, fromPath: '/b', toPath: '/y', statusCode: 302 },
    ])
    expect(summary).toEqual({ inserted: 2, updated: 0, errors: [] })

    const rows = await repo.find({ order: { fromPath: 'ASC' } })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ fromPath: '/a', toPath: '/x', statusCode: 301, hitCount: 0 })
  })

  it('is idempotent: re-run updates by from_path and preserves hit_count', async () => {
    const repo = AppDataSource.getRepository(Redirect)
    await repo.save(
      repo.create({ fromPath: '/a', toPath: '/old', statusCode: 301, hitCount: 42 }),
    )

    const summary = await upsertRedirectRows(repo, [
      { row: 1, fromPath: '/a', toPath: '/new', statusCode: 302 },
      { row: 2, fromPath: '/b', toPath: '/y', statusCode: 301 },
    ])
    expect(summary).toEqual({ inserted: 1, updated: 1, errors: [] })

    const updated = await repo.findOneByOrFail({ fromPath: '/a' })
    expect(updated.toPath).toBe('/new')
    expect(updated.statusCode).toBe(302)
    // The critical invariant: hit_count survives re-imports.
    expect(updated.hitCount).toBe(42)

    // Second identical run: nothing inserted, everything updated in place.
    const again = await upsertRedirectRows(repo, [
      { row: 1, fromPath: '/a', toPath: '/new', statusCode: 302 },
      { row: 2, fromPath: '/b', toPath: '/y', statusCode: 301 },
    ])
    expect(again).toEqual({ inserted: 0, updated: 2, errors: [] })
    expect(await repo.count()).toBe(2)
  })
})
