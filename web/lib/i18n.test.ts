import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from './i18n'

describe('isLocale', () => {
  it('returns true for each supported locale', () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(isLocale(loc)).toBe(true)
    }
  })

  it('returns false for unknown strings', () => {
    expect(isLocale('fr')).toBe(false)
    expect(isLocale('')).toBe(false)
    expect(isLocale('RU')).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isLocale(null)).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('DEFAULT_LOCALE', () => {
  it('is the first entry of SUPPORTED_LOCALES', () => {
    // Having them agree is load-bearing: middleware rewrites to
    // /${DEFAULT_LOCALE}, hreflang emits DEFAULT_LOCALE as x-default.
    expect(DEFAULT_LOCALE).toBe('ru')
    expect(SUPPORTED_LOCALES[0]).toBe(DEFAULT_LOCALE)
  })
})

describe('pickField', () => {
  interface Entity {
    name: string
    metaTitle: string | null
    translations?: Record<string, Record<string, unknown>> | null
  }

  const base: Entity = {
    name: 'Набор юного химика',
    metaTitle: 'Набор юного химика | Ximi4ka',
  }

  it('returns the top-level value when locale is default (RU)', () => {
    // RU is source-of-truth — we never read from `translations.ru`.
    const withStrayRu: Entity = {
      ...base,
      translations: { ru: { name: 'SHOULD_NOT_SHOW' } },
    }
    expect(pickField(withStrayRu, 'name', 'ru')).toBe('Набор юного химика')
  })

  it('returns the translated value when present for a non-default locale', () => {
    const entity: Entity = {
      ...base,
      translations: {
        en: { name: 'Young Chemist Kit', metaTitle: 'YCK | Ximi4ka' },
      },
    }
    expect(pickField(entity, 'name', 'en')).toBe('Young Chemist Kit')
    expect(pickField(entity, 'metaTitle', 'en')).toBe('YCK | Ximi4ka')
  })

  it('falls back to RU when the translation block is empty', () => {
    const entity: Entity = { ...base, translations: {} }
    expect(pickField(entity, 'name', 'en')).toBe('Набор юного химика')
  })

  it('falls back to RU when the specific field is missing in the locale', () => {
    const entity: Entity = {
      ...base,
      translations: { en: { metaTitle: 'YCK' } }, // no `name`
    }
    expect(pickField(entity, 'name', 'en')).toBe('Набор юного химика')
    expect(pickField(entity, 'metaTitle', 'en')).toBe('YCK')
  })

  it('treats null translation values as missing and falls back', () => {
    const entity: Entity = {
      ...base,
      translations: { en: { name: null } },
    }
    expect(pickField(entity, 'name', 'en')).toBe('Набор юного химика')
  })

  it('returns null when neither translation nor top-level is set', () => {
    const entity: Entity = { ...base, metaTitle: null }
    expect(pickField(entity, 'metaTitle', 'en')).toBeNull()
  })

  it('tolerates missing translations property entirely', () => {
    expect(pickField(base, 'name', 'en' as Locale)).toBe('Набор юного химика')
  })

  it('returns null when the entity is null/undefined', () => {
    expect(pickField(null, 'name', 'en')).toBeNull()
    expect(pickField(undefined, 'name', 'en')).toBeNull()
  })
})
