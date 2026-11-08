import { describe, it, expect } from 'vitest'
import {
  comparedPeriodText,
  engineLabel,
  formatCount,
  formatDelta,
  sourceLabel,
} from './trafficFormat'

describe('подписи и числа', () => {
  it('источники и поисковики по-русски, неизвестный код — как есть', () => {
    expect(sourceLabel('organic')).toBe('Поиск')
    expect(sourceLabel('direct')).toBe('Прямые заходы')
    expect(sourceLabel('newthing')).toBe('newthing')
    expect(engineLabel('yandex')).toBe('Яндекс')
    expect(engineLabel('google')).toBe('Google')
    expect(engineLabel('undefined')).toBe('Не определено')
  })
  it('formatDelta: процент, рост с нуля — «новое», ноль к нулю — тире', () => {
    expect(formatDelta(150, 100)).toBe('+50%')
    expect(formatDelta(50, 100)).toBe('−50%')
    expect(formatDelta(100, 100)).toBe('0%')
    expect(formatDelta(5, 0)).toBe('новое')
    expect(formatDelta(0, 0)).toBe('—')
  })
  it('formatCount — с разрядами', () => {
    expect(formatCount(4738)).toBe('4 738')
  })
})

describe('comparedPeriodText', () => {
  const prev = { prevFrom: '2026-10-13', prevTo: '2026-10-19' }
  it('есть прошлый период — процент и его даты', () => {
    expect(comparedPeriodText(150, 100, prev)).toBe('+50% к 13.10–19.10')
    expect(comparedPeriodText(50, 100, prev)).toBe('−50% к 13.10–19.10')
  })
  it('прошлый период пуст, текущий нет — данных нет; оба нуля — тире', () => {
    expect(comparedPeriodText(5, 0, prev)).toBe('в прошлом периоде (13.10–19.10) данных нет')
    expect(comparedPeriodText(0, 0, prev)).toBe('—')
  })
})
