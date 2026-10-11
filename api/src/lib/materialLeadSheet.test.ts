import { describe, it, expect } from 'vitest'
import type { MaterialLead } from '../entities/MaterialLead.js'
import { materialLeadSheetRow, sheetTimestamp } from './materialLeadSheet.js'

describe('sheetTimestamp', () => {
  it('пишет московское время в формате Tilda', () => {
    expect(sheetTimestamp(new Date('2026-10-09T14:48:27Z'))).toBe('2026-10-09 17:48:27')
  })
})

describe('materialLeadSheetRow', () => {
  const lead = {
    id: 'lead-1',
    name: 'Мария',
    phone: '89000000000',
    telegram: null,
    source: 'Youtube',
    createdAt: new Date('2026-10-09T10:56:45Z'),
  } as MaterialLead

  it('раскладывает заявку по колонкам таблицы: A–H, пустые I–AF, AG = yes', () => {
    const row = materialLeadSheetRow(lead)
    expect(row.slice(0, 8)).toEqual([
      'Мария',
      '89000000000',
      '',
      'Youtube',
      'https://ximi4ka.ru/get_materials',
      'form856589782',
      '2026-10-09 13:56:45',
      'lead-1',
    ])
    expect(row.slice(8, 32).every((cell) => cell === '')).toBe(true)
    expect(row[32]).toBe('yes')
    expect(row).toHaveLength(33)
  })
})
