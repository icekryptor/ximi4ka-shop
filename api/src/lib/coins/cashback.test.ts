import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CoinTransactionKind } from '@ximi4ka-shop/shared/types/coins'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { resetAccountTables, seedOrder, setCoinsProgram } from '../../routes/testUtils.js'
import { saveOrderWithStatusEvent } from '../notifications/outbox.js'
import { applyCoinTransaction } from './ledger.js'
import { revokeCashbackForOrder } from './cashback.js'

describe('начисление и отзыв кэшбека', () => {
  let customerId: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await resetAccountTables()
    const repo = AppDataSource.getRepository(Customer)
    customerId = (await repo.save(repo.create({ email: 'cashback@example.com' }))).id
  })

  afterEach(async () => {
    await setCoinsProgram(false)
  })

  const balanceOf = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query('SELECT coin_balance FROM customers WHERE id = $1', [id])
    return rows[0].coin_balance
  }
  const countKind = async (id: string, kind: CoinTransactionKind): Promise<number> => {
    const rows = await AppDataSource.query(
      'SELECT count(*)::int AS n FROM coin_transactions WHERE customer_id = $1 AND kind = $2',
      [id, kind],
    )
    return rows[0].n
  }
  const shortfallOf = async (orderId: string): Promise<number> => {
    const rows = await AppDataSource.query(
      'SELECT cashback_shortfall_coins AS s FROM orders WHERE id = $1',
      [orderId],
    )
    return rows[0].s
  }
  const adjust = (amount: number, key: string) =>
    AppDataSource.transaction((em) =>
      applyCoinTransaction(em, { customerId, amount, kind: 'admin_adjust', idempotencyKey: key }),
    )
  const seed = (overrides: Partial<Order> = {}) =>
    seedOrder({ status: 'shipped', customerId, cashbackPromisedCoins: 190, ...overrides })
  const deliver = async (orderId: string) => {
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({ id: orderId })
    const previous = order.status
    order.status = 'delivered'
    return saveOrderWithStatusEvent(order, previous)
  }
  const cancelDelivered = async (orderId: string) => {
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({ id: orderId })
    order.status = 'cancelled'
    return saveOrderWithStatusEvent(order, 'delivered')
  }

  it('получен: начисляет обещанное', async () => {
    const order = await seed()
    await deliver(order.id)
    expect(await balanceOf(customerId)).toBe(190)
    expect(await countKind(customerId, 'order_cashback')).toBe(1)
  })

  it('повторное сохранение того же перехода не начисляет второй раз', async () => {
    const order = await seed()
    const delivered = await deliver(order.id)
    await saveOrderWithStatusEvent(delivered, 'shipped')
    expect(await balanceOf(customerId)).toBe(190)
    expect(await countKind(customerId, 'order_cashback')).toBe(1)
  })

  it('гонка: два параллельных перехода в delivered — одна запись', async () => {
    const order = await seed()
    const results = await Promise.allSettled([deliver(order.id), deliver(order.id)])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(await countKind(customerId, 'order_cashback')).toBe(1)
    expect(await balanceOf(customerId)).toBe(190)
  })

  it('гостевой заказ: записи нет, ошибки нет', async () => {
    const order = await seed({ customerId: null })
    await deliver(order.id)
    expect(await countKind(customerId, 'order_cashback')).toBe(0)
    expect(await balanceOf(customerId)).toBe(0)
  })

  it('обещано 0 (старый заказ): записи нет', async () => {
    const order = await seed({ cashbackPromisedCoins: 0 })
    await deliver(order.id)
    expect(await countKind(customerId, 'order_cashback')).toBe(0)
  })

  it('программу выключили после оформления: обещанное всё равно начисляется', async () => {
    await setCoinsProgram(true, 10)
    const order = await seed()
    await setCoinsProgram(false)
    await deliver(order.id)
    expect(await balanceOf(customerId)).toBe(190)
  })

  it('отзыв при балансе 190: баланс 0, недостачи нет', async () => {
    const order = await seed()
    await deliver(order.id)
    await cancelDelivered(order.id)
    expect(await balanceOf(customerId)).toBe(0)
    expect(await shortfallOf(order.id)).toBe(0)
    expect(await countKind(customerId, 'order_cashback_revoke')).toBe(1)
  })

  it('отзыв с недостачей: потрачено 150, баланс 40 → 0, недостача 150', async () => {
    const order = await seed()
    await deliver(order.id)
    await adjust(-150, 'spent')
    const cancelled = await cancelDelivered(order.id)
    expect(await balanceOf(customerId)).toBe(0)
    expect(await shortfallOf(order.id)).toBe(150)
    expect(cancelled.cashbackShortfallCoins).toBe(150)
  })

  it('отзыв дважды: вторая запись не создаётся', async () => {
    const order = await seed()
    await deliver(order.id)
    await cancelDelivered(order.id)
    await cancelDelivered(order.id)
    expect(await countKind(customerId, 'order_cashback_revoke')).toBe(1)
    expect(await balanceOf(customerId)).toBe(0)
  })

  it('баланс 0 при отзыве: записи нет, потом заработанное не списывается повторным отзывом', async () => {
    const order = await seed()
    await deliver(order.id)
    await adjust(-190, 'spent-all')
    await cancelDelivered(order.id)
    expect(await countKind(customerId, 'order_cashback_revoke')).toBe(0)
    expect(await shortfallOf(order.id)).toBe(190)

    await adjust(500, 'earned-later')
    // свежий заказ из базы и устаревший объект с нулевой недостачей
    const fresh = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    const stale = Object.assign(new Order(), fresh, { cashbackShortfallCoins: 0 })
    await AppDataSource.transaction((em) => revokeCashbackForOrder(em, fresh))
    await AppDataSource.transaction((em) => revokeCashbackForOrder(em, stale))
    await cancelDelivered(order.id)
    expect(await balanceOf(customerId)).toBe(500)
    expect(await shortfallOf(order.id)).toBe(190)
    expect(await countKind(customerId, 'order_cashback_revoke')).toBe(0)
  })

  it('отзыв без начисления (не было order_cashback): ничего не делает', async () => {
    const order = await seed({ status: 'delivered' })
    await adjust(70, 'other')
    await cancelDelivered(order.id)
    expect(await balanceOf(customerId)).toBe(70)
    expect(await shortfallOf(order.id)).toBe(0)
  })

  it('гонка со списанием: отмена заказа не падает, баланс не уходит в минус', async () => {
    const order = await seed()
    await deliver(order.id)
    const results = await Promise.allSettled([
      adjust(-150, 'race-debit'),
      cancelDelivered(order.id),
    ])
    expect(results[1].status).toBe('fulfilled')
    expect(await balanceOf(customerId)).toBe(0)
    const refreshed = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(refreshed.status).toBe('cancelled')
  })
})
