import { describe, it, expect } from 'vitest'
import { parseTildaCsv } from './csv-parse.js'

describe('parseTildaCsv', () => {
  it('parses a simple semicolon CSV with a header', () => {
    const input = 'A;B\n1;2\n3;4\n'
    const rows = parseTildaCsv(input)
    expect(rows).toEqual([
      { A: '1', B: '2' },
      { A: '3', B: '4' },
    ])
  })

  it('skips empty trailing lines', () => {
    const input = 'A;B\n1;2\n\n\n'
    const rows = parseTildaCsv(input)
    expect(rows).toHaveLength(1)
  })

  it('handles quoted fields containing semicolons', () => {
    const input = 'Title;Cats\n"X";"Реактивы;Новинки"\n'
    const rows = parseTildaCsv(input)
    expect(rows[0]?.Cats).toBe('Реактивы;Новинки')
  })

  it('handles quoted fields containing newlines', () => {
    const input = 'A;B\n"line1\nline2";"y"\n'
    const rows = parseTildaCsv(input)
    expect(rows[0]?.A).toBe('line1\nline2')
  })

  it('returns empty array for header-only input', () => {
    expect(parseTildaCsv('A;B\n')).toEqual([])
  })
})
