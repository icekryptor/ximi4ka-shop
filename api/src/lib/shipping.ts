import type { DeliveryMethod } from '@ximi4ka-shop/shared'

// Delivery pricing, mirroring the rules from the old Tilda checkout:
// СДЭК до ПВЗ — бесплатно от 3000 ₽, иначе 350 ₽;
// СДЭК курьером — бесплатно от 5000 ₽, иначе 500 ₽.
//
// Kept as one exported constant so the values can later move into
// SiteSettings without touching the calculation call sites.
export const SHIPPING_RULES: Record<
  DeliveryMethod,
  { freeFromRub: number; priceRub: number }
> = {
  cdek_pvz: { freeFromRub: 3000, priceRub: 350 },
  cdek_courier: { freeFromRub: 5000, priceRub: 500 },
}

export function calcShippingRub(
  method: DeliveryMethod,
  subtotalRub: number,
): number {
  const rule = SHIPPING_RULES[method]
  return subtotalRub >= rule.freeFromRub ? 0 : rule.priceRub
}
