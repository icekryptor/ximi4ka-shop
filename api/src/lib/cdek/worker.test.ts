import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { Product } from '../../entities/Product.js'
import { CdekError } from './client.js'
import type { CdekOrderConfig } from './orders.js'
import {
  CDEK_POLL_INTERVAL_MS,
  CDEK_REGISTER_TIMEOUT_MS,
  MAX_SHIPMENTS_PER_TICK,
  processDueShipments,
  startCdekShipmentWorker,
} from './worker.js'

const NOW = new Date('2026-09-25T12:00:00Z')
const at = (ms: number) => new Date(NOW.getTime() + ms)
const UUID = '1aa05817-5e99-4bae-99af-69b3b3c16233'
const PRODUCT_ID = '00000000-0000-4000-8000-000000000001'

const config: CdekOrderConfig = {
  shipmentPoint: 'MSK310',
  sender: { company: 'ИП Тестова', name: 'Тестова Анна', phone: '+79990000000', email: null },
  sellerName: 'ИП Тестова',
  tariffPvz: 136,
  tariffCourier: 137,
}

let seq = 0
async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      orderNumber: `XM-2026-9${String(seq).padStart(4, '0')}`,
      status: 'paid',
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
      paymentProvider: 'manual',
      statusHistory: [],
      ...overrides,
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
  return order
}

async function seedShipment(
  orderId: string,
  overrides: Partial<CdekShipment> = {},
): Promise<CdekShipment> {
  const repo = AppDataSource.getRepository(CdekShipment)
  return repo.save(repo.create({ orderId, nextAttemptAt: at(-1000), ...overrides }))
}

const shipment = (id: string) => AppDataSource.getRepository(CdekShipment).findOneByOrFail({ id })

function fakeCdek() {
  return { get: vi.fn(), post: vi.fn() }
}

const accepted = (uuid = UUID) => ({
  entity: { uuid },
  requests: [{ type: 'CREATE', state: 'ACCEPTED' }],
})

describe('processDueShipments', () => {
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

  it('queued → POST тела заказа → registering', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockResolvedValue(accepted())

    expect(await processDueShipments({ cdek, config }, { now: NOW })).toMatchObject({
      submitted: 1,
    })

    expect(cdek.get).not.toHaveBeenCalled()
    expect(cdek.post).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({
        number: order.orderNumber,
        delivery_point: 'NLCH7',
        shipment_point: 'MSK310',
        recipient: { name: 'Иван Петров', phones: [{ number: '+79123456789' }] },
      }),
    )
    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: NOW,
      nextAttemptAt: at(CDEK_POLL_INTERVAL_MS),
      attempts: 0,
    })
  })

  it('registering → SUCCESSFUL с номером → created', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-30_000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID, cdek_number: '10325990882' },
      requests: [{ type: 'CREATE', state: 'SUCCESSFUL' }],
    })

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.get).toHaveBeenCalledWith(`/orders/${UUID}`)
    expect(await shipment(s.id)).toMatchObject({
      state: 'created',
      cdekNumber: '10325990882',
      lastError: null,
    })
  })

  it('registering → INVALID → failed с текстом СДЭК', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-30_000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID },
      requests: [
        { type: 'CREATE', state: 'INVALID', errors: [{ code: 'x', message: 'Неверный телефон' }] },
      ],
    })

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({ state: 'failed', lastError: 'Неверный телефон' })
  })

  it('ACCEPTED — ждём ещё 15 с, попытка не считается', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-60_000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(accepted())

    expect(await processDueShipments({ cdek, config }, { now: NOW })).toMatchObject({ waiting: 1 })

    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      attempts: 0,
      nextAttemptAt: at(CDEK_POLL_INTERVAL_MS),
    })
  })

  it('ACCEPTED дольше 30 минут — опрос по общему расписанию, POST не повторяется', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-CDEK_REGISTER_TIMEOUT_MS - 1000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).not.toHaveBeenCalled()
    const row = await shipment(s.id)
    expect(row).toMatchObject({ state: 'registering', attempts: 1, nextAttemptAt: at(60_000) })
    expect(row.lastError).toContain('ACCEPTED')
  })

  it('сетевой сбой POST — повтор через минуту; следующая попытка подхватывает заказ по номеру', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockRejectedValueOnce(
      new CdekError(0, 'network_error', 'СДЭК недоступен: socket hang up'),
    )

    await processDueShipments({ cdek, config }, { now: NOW })
    expect(await shipment(s.id)).toMatchObject({
      state: 'queued',
      attempts: 1,
      nextAttemptAt: at(60_000),
    })

    // POST на самом деле дошёл — СДЭК знает заказ под нашим номером.
    cdek.get.mockResolvedValueOnce(accepted('2bb05817-5e99-4bae-99af-69b3b3c16233'))
    await processDueShipments({ cdek, config }, { now: at(61_000) })

    expect(cdek.get).toHaveBeenCalledWith('/orders', { im_number: order.orderNumber })
    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      cdekUuid: '2bb05817-5e99-4bae-99af-69b3b3c16233',
    })
  })

  it('по номеру не нашли — создаём заново', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, { attempts: 1 })
    const cdek = fakeCdek()
    cdek.get.mockRejectedValue(
      new CdekError(400, 'v2_entity_not_found_im_number', 'Entity is not found'),
    )
    cdek.post.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect((await shipment(s.id)).state).toBe('registering')
  })

  it('по номеру нашли INVALID — создаём заново', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, { attempts: 0, cdekUuid: UUID })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID },
      requests: [{ type: 'CREATE', state: 'INVALID' }],
    })
    cdek.post.mockResolvedValue(accepted('3cc05817-5e99-4bae-99af-69b3b3c16233'))

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      cdekUuid: '3cc05817-5e99-4bae-99af-69b3b3c16233',
    })
  })

  it('ошибка данных на POST (400) — сразу failed', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockRejectedValue(
      new CdekError(400, 'v2_field_is_empty', '[packages[0].items] is empty'),
    )

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: '[packages[0].items] is empty',
    })
  })

  it('429 — пауза не меньше 30 с, попытка не считается', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockRejectedValue(new CdekError(429, 'http_error', 'СДЭК ответил 429'))

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({
      state: 'queued',
      attempts: 0,
      nextAttemptAt: at(30_000),
    })
  })

  it('заказ отменили, пока он ждал, — в СДЭК не отправляем', async () => {
    const order = await seedOrder({ status: 'cancelled' })
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).not.toHaveBeenCalled()
    const row = await shipment(s.id)
    expect(row.state).toBe('failed')
    expect(row.lastError).toContain('не оплачен')
  })

  it('сдаётся, когда окно повторов достигает суток', async () => {
    const order = await seedOrder()
    // retryWindowMs(8) — первые сутки (см. тесты уведомлений).
    const s = await seedShipment(order.id, { attempts: 7 })
    const cdek = fakeCdek()
    cdek.get.mockRejectedValue(new CdekError(0, 'network_error', 'СДЭК недоступен'))

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({ state: 'failed', attempts: 8 })
  })

  it('старый заказ без сохранённых мест — места считаются по карточкам товаров', async () => {
    await AppDataSource.getRepository(Product).save(
      AppDataSource.getRepository(Product).create({
        id: PRODUCT_ID,
        slug: 'h2so4',
        name: 'Серная кислота 7%',
        sku: 'H2SO4',
        priceRub: 119,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
        weightG: 250,
      }),
    )
    const order = await seedOrder({
      deliveryAddress: {
        address: 'Нальчик, ул. Ленина, 1',
        comment: null,
        cityCode: 1081,
        deliveryPointCode: 'NLCH7',
      },
    })
    await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    const body = cdek.post.mock.calls[0][1]
    expect(body.packages).toHaveLength(1)
    expect(body.packages[0].items).toEqual([
      expect.objectContaining({ ware_key: 'H2SO4', weight: 250, amount: 2, cost: 119 }),
    ])
  })

  it(`за тик — не больше ${MAX_SHIPMENTS_PER_TICK} записей`, async () => {
    for (let i = 0; i < MAX_SHIPMENTS_PER_TICK + 2; i += 1) {
      const order = await seedOrder()
      await seedShipment(order.id)
    }
    const cdek = fakeCdek()
    cdek.post.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).toHaveBeenCalledTimes(MAX_SHIPMENTS_PER_TICK)
  })

  it('created и failed не трогаем', async () => {
    const a = await seedOrder()
    const b = await seedOrder()
    await seedShipment(a.id, { state: 'created', cdekNumber: '1' })
    await seedShipment(b.id, { state: 'failed' })
    const cdek = fakeCdek()

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.get).not.toHaveBeenCalled()
    expect(cdek.post).not.toHaveBeenCalled()
  })
})

describe('startCdekShipmentWorker', () => {
  const env = {
    CDEK_ORDERS_ENABLED: 'true',
    CDEK_SHIPMENT_POINT: 'MOS4',
    CDEK_SENDER_COMPANY: 'ИП Тестова',
    CDEK_SENDER_NAME: 'Тестова Анна',
    CDEK_SENDER_PHONE: '+79990000000',
    CDEK_API_URL: 'https://api.edu.cdek.ru/v2',
    NODE_ENV: 'development',
  }
  const cdek = { get: vi.fn(), post: vi.fn() }

  it('флаг выключен — не стартует', () => {
    expect(startCdekShipmentWorker({ env: { ...env, CDEK_ORDERS_ENABLED: '' }, cdek })).toBeNull()
  })

  it('нет реквизитов — не стартует, в логе чего не хватает', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(startCdekShipmentWorker({ env: { ...env, CDEK_SENDER_NAME: '' }, cdek })).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('CDEK_SENDER_NAME'))
    spy.mockRestore()
  })

  it('вне production на боевом СДЭК — не стартует', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const prod = {
      ...env,
      CDEK_API_URL: undefined,
      CDEK_CLIENT_ID: 'id',
      CDEK_CLIENT_SECRET: 'secret',
    }
    expect(startCdekShipmentWorker({ env: prod, cdek })).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('api.edu.cdek.ru'))
    spy.mockRestore()
  })

  it('песочница вне production — стартует', () => {
    const timer = startCdekShipmentWorker({ env, cdek, intervalMs: 60_000 })
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })

  it('production на боевом СДЭК — стартует', () => {
    const prod = {
      ...env,
      CDEK_API_URL: undefined,
      CDEK_CLIENT_ID: 'id',
      CDEK_CLIENT_SECRET: 'secret',
      NODE_ENV: 'production',
    }
    const timer = startCdekShipmentWorker({ env: prod, cdek, intervalMs: 60_000 })
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })
})
