import { describe, it, expect } from 'vitest'
import { ProductGridBlock } from './ProductGridBlock'

describe('ProductGridBlock', () => {
  it('is declared as an async server component', () => {
    // ProductGridBlock fetches products from the API — the async contract is
    // load-bearing (BlockRenderer relies on React 19 awaiting nested async
    // children). If this regresses to a sync function, suspense would break.
    expect(ProductGridBlock.constructor.name).toBe('AsyncFunction')
  })
})
