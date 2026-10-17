import { expectTypeOf, test } from 'vitest'
import type { CheckoutRequest, DeliveryAddress, OrderDeliveryMethod, OrderDto } from './order.js'

test('OrderDto.status is a discriminated literal union', () => {
  expectTypeOf<OrderDto['status']>().toEqualTypeOf<
    'pending' | 'paid' | 'shipped' | 'failed' | 'cancelled'
  >()
})

test('OrderDeliveryMethod включает способ для стран ЕАЭС', () => {
  expectTypeOf<OrderDeliveryMethod>().toEqualTypeOf<
    'cdek_pvz' | 'cdek_courier' | 'cdek_manual_cis'
  >()
})

test('CheckoutRequest.delivery принимает доставку в страну ЕАЭС с комментарием', () => {
  const delivery: CheckoutRequest['delivery'] = {
    method: 'cdek_manual_cis',
    country: 'BY',
    city: 'Минск',
    address: 'ул. Ленина, 5',
    comment: 'после 18:00',
  }
  expectTypeOf(delivery).toMatchTypeOf<CheckoutRequest['delivery']>()
})

test('DeliveryAddress хранит страну и город', () => {
  expectTypeOf<DeliveryAddress['country']>().toEqualTypeOf<
    'BY' | 'KZ' | 'AM' | 'KG' | null | undefined
  >()
  expectTypeOf<DeliveryAddress['city']>().toEqualTypeOf<string | null | undefined>()
})
