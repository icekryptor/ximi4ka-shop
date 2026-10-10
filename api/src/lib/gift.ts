import { IsNull } from 'typeorm'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from '../entities/Product.js'

// Подарок к заказу: один реактив на выбор из списка, если за товары (после
// оптовых скидок) платят не меньше порога. Зеркало — web/lib/gift.ts: правки
// вносим в оба файла.
export const GIFT_THRESHOLD_RUB = 3000

export const GIFT_SLUGS: readonly string[] = [
  'azotnaya-kislota-10',
  'solyanaya-kislota',
  'iodat-kaliya',
]

// Подарок, как его выбрал покупатель, проверяем на сервере: id приходит от
// клиента, а строка заказа получается бесплатной. Не прошёл проверку — подарка
// нет, а заказ принимается: закончившийся реактив не должен срывать покупку.
export async function loadGift(
  giftProductId: string | undefined,
  payableRub: number,
): Promise<Product | null> {
  if (!giftProductId || payableRub < GIFT_THRESHOLD_RUB) return null
  const product = await AppDataSource.getRepository(Product).findOne({
    where: { id: giftProductId, deletedAt: IsNull() },
  })
  if (!product || !product.isPublished || product.stockStatus !== 'in_stock') return null
  if (!GIFT_SLUGS.includes(product.slug)) return null
  return product
}
