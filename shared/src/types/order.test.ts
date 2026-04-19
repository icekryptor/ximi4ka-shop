import { expectTypeOf, test } from 'vitest'
import type { OrderDto } from './order'

test('OrderDto.status is a discriminated literal union', () => {
  expectTypeOf<OrderDto['status']>().toEqualTypeOf<'pending' | 'paid' | 'failed' | 'cancelled'>()
})
