import { describe, it, expect } from 'vitest'
import { metadata } from './page'
import { metadata as thanksMetadata } from './thanks/page'

describe('/get_materials pages', () => {
  it.each([
    ['form', metadata],
    ['thank-you', thanksMetadata],
  ])('keeps the %s page out of search', (_name, meta) => {
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})
