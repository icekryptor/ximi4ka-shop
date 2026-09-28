import { In } from 'typeorm'
import type {
  AccountOrderSummary,
  AccountOrdersPage,
  CustomerProfile,
  DeliveryMethod,
  LastDelivery,
  PublicOrderShipment,
} from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import type { Customer } from '../../entities/Customer.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { ProductImage } from '../../entities/ProductImage.js'
import { cdekTrackingUrl } from '../../routes/public/orders.js'
import { badRequest } from '../../routes/errors.js'

const PREVIEW_ITEMS = 3

export function toProfile(c: Customer, last: LastDelivery | null): CustomerProfile {
  return {
    id: c.id,
    email: c.email,
    telegramUsername: c.telegramUsername,
    hasTelegram: c.telegramId !== null,
    name: c.name,
    phone: c.phone,
    lastDelivery: last,
  }
}

// Адрес заказа — «<город>, <остальное>» (web/lib/shipping.ts).
export async function lastDeliveryFor(customerId: string): Promise<LastDelivery | null> {
  const o = await AppDataSource.getRepository(Order).findOne({
    where: { customerId },
    order: { createdAt: 'DESC' },
  })
  if (!o) return null
  const a = o.deliveryAddress
  const comma = a.address.indexOf(',')
  const cityName = comma > 0 ? a.address.slice(0, comma).trim() : null
  const rest = comma > 0 ? a.address.slice(comma + 1).trim() : a.address
  const method = o.deliveryMethod as DeliveryMethod
  return {
    method,
    cityCode: a.cityCode ?? null,
    cityName,
    deliveryPointCode: method === 'cdek_pvz' ? (a.deliveryPointCode ?? null) : null,
    postalCode: method === 'cdek_courier' ? (a.postalCode ?? null) : null,
    courierStreet: method === 'cdek_courier' ? rest || null : null,
  }
}

function shipmentView(s: CdekShipment | undefined): PublicOrderShipment | null {
  if (!s) return null
  if (s.state === 'created' && s.cdekNumber) {
    return {
      state: 'created',
      trackingNumber: s.cdekNumber,
      trackingUrl: cdekTrackingUrl(s.cdekNumber),
    }
  }
  return {
    state: s.state === 'failed' ? 'failed' : 'pending',
    trackingNumber: null,
    trackingUrl: null,
  }
}

// Курсор — «<ISO created_at>_<id>» последнего заказа страницы.
function parseCursor(cursor: string): { at: Date; id: string } {
  const sep = cursor.lastIndexOf('_')
  const at = new Date(cursor.slice(0, sep))
  const id = cursor.slice(sep + 1)
  if (sep < 1 || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw badRequest('invalid_cursor', 'Неверный курсор')
  }
  return { at, id }
}

export async function listCustomerOrders(
  customerId: string,
  cursor: string | null,
  limit = 20,
): Promise<AccountOrdersPage> {
  // created_at хранится с точностью до микросекунд, а курсор строится из
  // toISOString() (миллисекунды) — сравниваем и сортируем по одному и тому
  // же усечённому до мс значению, иначе строка, делящая миллисекунду с
  // курсорной, но с большими микросекундами и меньшим id, теряется: она
  // "меньше" курсора по (created_at, id), но ORDER BY по полному created_at
  // ставит её раньше него.
  const qb = AppDataSource.getRepository(Order)
    .createQueryBuilder('o')
    .where('o.customer_id = :customerId', { customerId })
    .orderBy("date_trunc('milliseconds', o.created_at)", 'DESC')
    .addOrderBy('o.id', 'DESC')
    .limit(limit + 1)
  if (cursor) {
    const c = parseCursor(cursor)
    qb.andWhere("(date_trunc('milliseconds', o.created_at), o.id) < (:at, :id)", {
      at: c.at,
      id: c.id,
    })
  }
  const rows = await qb.getMany()
  const page = rows.slice(0, limit)
  const ids = page.map((o) => o.id)
  if (ids.length === 0) return { orders: [], nextCursor: null }

  const [items, shipments] = await Promise.all([
    AppDataSource.getRepository(OrderItem).find({
      where: { orderId: In(ids) },
      order: { id: 'ASC' },
    }),
    AppDataSource.getRepository(CdekShipment).find({ where: { orderId: In(ids) } }),
  ])
  const productIds = [...new Set(items.map((i) => i.productId))]
  const images = productIds.length
    ? await AppDataSource.getRepository(ProductImage).find({
        where: { productId: In(productIds) },
        order: { sortOrder: 'ASC' },
      })
    : []
  const imageOf = new Map<string, string>()
  for (const img of images) if (!imageOf.has(img.productId)) imageOf.set(img.productId, img.url)

  const orders: AccountOrderSummary[] = page.map((o) => {
    const mine = items.filter((i) => i.orderId === o.id)
    return {
      orderNumber: o.orderNumber,
      publicToken: o.publicToken,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      paymentProvider: o.paymentProvider,
      totalRub: o.totalRub,
      itemCount: mine.reduce((n, i) => n + i.quantity, 0),
      items: mine.slice(0, PREVIEW_ITEMS).map((i) => ({
        name: i.productSnapshot.name,
        quantity: i.quantity,
        imageUrl: imageOf.get(i.productId) ?? null,
      })),
      shipment: shipmentView(shipments.find((s) => s.orderId === o.id)),
    }
  })
  const last = page[page.length - 1]
  return {
    orders,
    nextCursor: rows.length > limit ? `${last.createdAt.toISOString()}_${last.id}` : null,
  }
}
