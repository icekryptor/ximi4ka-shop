import { describe, it, expect } from 'vitest'
import { formulaForSlug } from './reagentFormulas'

describe('formulaForSlug', () => {
  it('returns the formula with unicode subscripts', () => {
    expect(formulaForSlug('sulfat-alyuminiya')).toBe('Al₂(SO₄)₃')
    expect(formulaForSlug('nitrat-serebra')).toBe('AgNO₃')
    expect(formulaForSlug('karbonat-ammoniya')).toBe('(NH₄)₂CO₃')
  })

  it('returns null for products without a known formula', () => {
    expect(formulaForSlug('probirka')).toBeNull()
    expect(formulaForSlug('tri-kisloti')).toBeNull()
  })
})
