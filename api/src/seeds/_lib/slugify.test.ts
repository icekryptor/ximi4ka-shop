import { describe, it, expect } from 'vitest'
import { slugify, dedupeSlug } from './slugify.js'

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('transliterates Cyrillic to Latin', () => {
    expect(slugify('Химичка')).toBe('himichka')
    expect(slugify('Реактивы')).toBe('reaktivy')
  })

  it('handles mixed Cyrillic + Latin + digits', () => {
    expect(slugify('Химичка 3.0')).toBe('himichka-3-0')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  Hello  ')).toBe('hello')
    expect(slugify('—Тест—')).toBe('test')
  })

  it('collapses runs of separators into a single hyphen', () => {
    expect(slugify('a   b___c')).toBe('a-b-c')
  })

  it('handles soft/hard signs by dropping them', () => {
    expect(slugify('объём')).toBe('obyom')
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })

  it('handles ё → yo', () => {
    expect(slugify('Ёлка')).toBe('yolka')
  })
})

describe('dedupeSlug', () => {
  it('returns base when not seen yet', () => {
    const seen = new Set<string>()
    expect(dedupeSlug('foo', seen)).toBe('foo')
    expect(seen.has('foo')).toBe(true)
  })

  it('appends -2 on second occurrence', () => {
    const seen = new Set<string>(['foo'])
    expect(dedupeSlug('foo', seen)).toBe('foo-2')
    expect(seen.has('foo-2')).toBe(true)
  })

  it('keeps incrementing past -2', () => {
    const seen = new Set<string>(['foo', 'foo-2'])
    expect(dedupeSlug('foo', seen)).toBe('foo-3')
  })

  it('treats different bases independently', () => {
    const seen = new Set<string>(['foo'])
    expect(dedupeSlug('bar', seen)).toBe('bar')
  })
})
