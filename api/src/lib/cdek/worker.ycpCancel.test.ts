import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { CdekError } from './client.js'
import type { CdekOrderConfig } from './orders.js'
import { processDueShipments } from './worker.js'
import { cancelYcpOrder } from '../ycp/orders.js'

// Гонка: Яндекс отменяет оплаченный заказ, пока обработчик СДЭК уже прошёл
// проверку статуса и ждёт ответа POST /orders. Отмена видит очередь queued без
// попыток и не сигналит, а посылка в СДЭК всё же создаётся — сигнал должен
// поставить сам обработчик после POST.

const NOW = new Date('2026-10-11T12:00:00Z')
const UUID = '1aa05817-5e99-4bae-99af-69b3b3c16233'
const PRODUCT_ID = '00000000-0000-4000-8000-000000000001'

const config: CdekOrderConfig = {
  shipmentPoint: 'MSK310',
  sender: { company: 'ИП Тестова', name: 'Тестова Анна', phone: '+79990000000', email: null },
  sellerName: 'ИП Тестова',
  tariffPvz: 136,
  tariffCourier: 137,
}

async function seed(source: 'ycp' | 'site'): Promise<{ order: Order; shipment: CdekShipment }> {
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      orderNumber: 'XM-2026-90001',
      status: 'paid',
      source,
      externalOrderId: source === 'ycp' ? 'ya-race' : null,
      customerName: 'Иван Петров',
      customerPhone: '89123456789',
      customerEmail: '',
      deliveryAddress: {
        address: 'Нальчик, ул. Ленина, 1',
        comment: null,
        cityCode: 1081,
        deliveryPointCode: 'NLCH7',
        packages: [
          {
            box: 'small',
            weightG: 300,
            lengthCm: 10,
            widthCm: 10,
            heightCm: 4,
            estimated: false,
            items: [{ productId: PRODUCT_ID, quantity: 2 }],
          },
        ],
      },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 238,
      shippingRub: 0,
      totalRub: 238,
      paymentProvider: source === 'ycp' ? 'ycp' : 'manual',
      statusHistory: [],
    }),
  )
  const items = AppDataSource.getRepository(OrderItem)
  await items.save(
    items.create({
      orderId: order.id,
      productId: PRODUCT_ID,
      productSnapshot: { name: 'Серная кислота 7%', sku: 'H2SO4', priceRub: 119 },
      quantity: 2,
      unitPriceRub: 119,
    }),
  )
  const shipments = AppDataSource.getRepository(CdekShipment)
  const shipment = await shipments.save(
    shipments.create({ orderId: order.id, nextAttemptAt: new Date(NOW.getTime() - 1000) }),
  )
  return { order, shipment }
}

const alerts = async (orderId: string) =>
  (await AppDataSource.getRepository(OrderNotification).findBy({ orderId })).filter(
    (e) => e.eventKey === 'ycp:cancel_after_ship',
  )

// СДЭК, у которого POST /orders «долгий»: пока он идёт, заказ отменяют.
function cdekCancelledDuringPost(externalOrderId: string) {
  return {
    get: vi.fn().mockRejectedValue(new CdekError(400, 'v2_entity_not_found_im_number', 'нет')),
    post: vi.fn(async () => {
      expect(await cancelYcpOrder(externalOrderId)).toBe('cancelled')
      return { entity: { uuid: UUID }, requests: [{ type: 'CREATE', state: 'ACCEPTED' }] }
    }),
  }
}

describe('обработчик СДЭК: отмена из Яндекса во время POST', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items, products RESTART IDENTITY CASCADE')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('заказ Яндекса отменён внутри POST — ровно один сигнал, повторный проход не добавляет', async () => {
    const { order, shipment } = await seed('ycp')
    const cdek = cdekCancelledDuringPost('ya-race')

    expect(await processDueShipments({ cdek, config }, { now: NOW })).toMatchObject({
      submitted: 1,
    })
    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })).status,
    ).toBe('cancelled')
    expect((await alerts(order.id)).map((a) => a.channel)).toEqual(['telegram'])

    // Второй проход: registering → опрос. Сигнал не двоится.
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID, cdek_number: '1000' },
      requests: [{ type: 'CREATE', state: 'ACCEPTED' }],
    })
    await processDueShipments({ cdek, config }, { now: new Date(NOW.getTime() + 60_000) })
    // Повтор отправки той же записи (ручной повтор в админке) — тоже без дубля.
    await AppDataSource.getRepository(CdekShipment).update(shipment.id, {
      state: 'queued',
      nextAttemptAt: new Date(NOW.getTime() - 1000),
    })
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID },
      requests: [{ type: 'CREATE', state: 'ACCEPTED' }],
    })
    await processDueShipments({ cdek, config }, { now: new Date(NOW.getTime() + 120_000) })
    expect(await alerts(order.id)).toHaveLength(1)
  })

  it('заказ с сайта, отменённый внутри POST, сигнала не получает', async () => {
    const { order } = await seed('site')
    const cdek = {
      get: vi.fn().mockRejectedValue(new CdekError(400, 'v2_entity_not_found_im_number', 'нет')),
      post: vi.fn(async () => {
        await AppDataSource.getRepository(Order).update(order.id, { status: 'cancelled' })
        return { entity: { uuid: UUID }, requests: [{ type: 'CREATE', state: 'ACCEPTED' }] }
      }),
    }
    await processDueShipments({ cdek, config }, { now: NOW })
    expect(await alerts(order.id)).toHaveLength(0)
  })

  it('заказ Яндекса не отменён — сигнала нет', async () => {
    const { order } = await seed('ycp')
    const cdek = {
      get: vi.fn().mockRejectedValue(new CdekError(400, 'v2_entity_not_found_im_number', 'нет')),
      post: vi.fn().mockResolvedValue({
        entity: { uuid: UUID },
        requests: [{ type: 'CREATE', state: 'ACCEPTED' }],
      }),
    }
    await processDueShipments({ cdek, config }, { now: NOW })
    expect(await alerts(order.id)).toHaveLength(0)
  })

  it('СДЭК уже знает заказ под нашим номером, а заказ отменили — сигнал тоже', async () => {
    const { order } = await seed('ycp')
    const cdek = {
      get: vi.fn(async () => {
        expect(await cancelYcpOrder('ya-race')).toBe('cancelled')
        return { entity: { uuid: UUID }, requests: [{ type: 'CREATE', state: 'ACCEPTED' }] }
      }),
      post: vi.fn(),
    }
    await processDueShipments({ cdek, config }, { now: NOW })
    expect(cdek.post).not.toHaveBeenCalled()
    expect(await alerts(order.id)).toHaveLength(1)
  })
})
