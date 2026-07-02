import { describe, it, expect } from 'vitest'
import { slugify } from './slugify'

// Mirrors api/src/seeds/_lib/slugify.test.ts — the two implementations must
// stay behaviourally identical so admin-typed slugs match importer slugs.
describe('slugify', () => {
  it('transliterates Cyrillic to Latin', () => {
    expect(slugify('Химия для детей')).toBe('himiya-dlya-detey')
    expect(slugify('Опыты и эксперименты')).toBe('opyty-i-eksperimenty')
  })

  it('handles ё, щ, ъ, ь digraphs and drops', () => {
    expect(slugify('Ёлка')).toBe('yolka')
    expect(slugify('Щёлочь')).toBe('schyoloch')
    expect(slugify('объект')).toBe('obekt')
  })

  it('lowercases and collapses non-alphanumerics into single dashes', () => {
    expect(slugify('Hello,  World!')).toBe('hello-world')
    expect(slugify('А — Б')).toBe('a-b')
  })

  it('trims leading and trailing dashes', () => {
    expect(slugify('!Привет!')).toBe('privet')
  })

  it('keeps digits', () => {
    expect(slugify('Топ 10 опытов')).toBe('top-10-opytov')
  })

  it('returns empty string for punctuation-only input', () => {
    expect(slugify('!!!')).toBe('')
  })
})
