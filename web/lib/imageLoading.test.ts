import { describe, it, expect } from 'vitest'
import { firstScreenImageLoading, imageLoadingProps } from './imageLoading'

describe('firstScreenImageLoading', () => {
  it('первая картинка — priority, остальные из eagerCount — eager, дальше lazy', () => {
    expect(firstScreenImageLoading(0, 3)).toBe('priority')
    expect(firstScreenImageLoading(1, 3)).toBe('eager')
    expect(firstScreenImageLoading(2, 3)).toBe('eager')
    expect(firstScreenImageLoading(3, 3)).toBe('lazy')
    expect(firstScreenImageLoading(9, 3)).toBe('lazy')
  })

  it('при eagerCount 0 всё ленивое', () => {
    expect(firstScreenImageLoading(0, 0)).toBe('lazy')
  })
})

describe('imageLoadingProps', () => {
  it('lazy не добавляет атрибутов — next/image сам ставит loading="lazy"', () => {
    expect(imageLoadingProps('lazy')).toEqual({})
  })

  it('eager снимает lazy, но не поднимает приоритет', () => {
    expect(imageLoadingProps('eager')).toEqual({ loading: 'eager' })
  })

  it('priority — eager и fetchPriority="high"', () => {
    expect(imageLoadingProps('priority')).toEqual({ loading: 'eager', fetchPriority: 'high' })
  })
})
