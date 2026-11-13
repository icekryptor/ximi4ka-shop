import { cashbackCoins } from '@ximi4ka-shop/shared/types/coins'
import type { Order } from '../../entities/Order.js'
import type { SiteSettings } from '../../entities/SiteSettings.js'

// Кэшбек, обещанный покупателю при оформлении: процент от суммы товаров после оптовых
// скидок и промокода. Доставка и надбавка за способ оплаты в базу не входят. 0, если
// программа выключена.
export function promisedCashback(
  order: Pick<Order, 'subtotalRub' | 'discountRub' | 'promoDiscountRub'>,
  settings: Pick<SiteSettings, 'coinsEnabled' | 'coinsCashbackPercent'>,
): number {
  if (!settings.coinsEnabled) return 0
  const goodsPaidRub = order.subtotalRub - order.discountRub - order.promoDiscountRub
  return cashbackCoins(goodsPaidRub, settings.coinsCashbackPercent)
}
