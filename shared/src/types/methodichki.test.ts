import { describe, expect, it } from 'vitest'
import { METHODICHKI, methodichkiForSlugs } from './methodichki.js'

describe('methodichkiForSlugs', () => {
  it('maps each kit to its own methodichka', () => {
    expect(methodichkiForSlugs(['himichka-30']).map((m) => m.key)).toEqual(['himichka'])
    expect(methodichkiForSlugs(['mini-himichka']).map((m) => m.key)).toEqual(['himichka'])
    expect(methodichkiForSlugs(['elektrohimichka']).map((m) => m.key)).toEqual(['elektrohimichka'])
    expect(methodichkiForSlugs(['bolshoi-nabor-dlya-oge']).map((m) => m.key)).toEqual(['oge'])
  })

  it('gives the e-methodichka to buyers of the 499 ₽ products too', () => {
    expect(methodichkiForSlugs(['himichka-metodichka']).map((m) => m.key)).toEqual(['himichka'])
    expect(methodichkiForSlugs(['elektrometodichka']).map((m) => m.key)).toEqual([
      'elektrohimichka',
    ])
  })

  it('expands combos into the methodichki of their kits', () => {
    expect(methodichkiForSlugs(['himichka-i-elektrohimichka']).map((m) => m.key)).toEqual([
      'himichka',
      'elektrohimichka',
    ])
    expect(methodichkiForSlugs(['vse-tri-nabora']).map((m) => m.key)).toEqual([
      'himichka',
      'elektrohimichka',
    ])
    expect(methodichkiForSlugs(['vse-chetyre-nabora']).map((m) => m.key)).toEqual([
      'himichka',
      'elektrohimichka',
      'oge',
    ])
  })

  it('deduplicates, keeps a stable order and ignores unknown slugs', () => {
    const keys = methodichkiForSlugs([
      'bolshoi-nabor-dlya-oge',
      'mini-himichka',
      'himichka-30',
      'nope',
    ]).map((m) => m.key)
    expect(keys).toEqual(['himichka', 'oge'])
  })

  it('returns nothing for orders without kits', () => {
    expect(methodichkiForSlugs([])).toEqual([])
    expect(methodichkiForSlugs(['reagent-x'])).toEqual([])
  })

  it('serves files from /methodichki/ with titles', () => {
    for (const m of Object.values(METHODICHKI)) {
      expect(m.url).toMatch(/^\/methodichki\/[a-z0-9-]+\.pdf$/)
      expect(m.title.length).toBeGreaterThan(3)
    }
  })
})
