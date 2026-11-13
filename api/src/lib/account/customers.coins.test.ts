import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { resetAccountTables, seedOrder } from '../../routes/testUtils.js'
import { saveOrderWithStatusEvent } from '../notifications/outbox.js'
import { accrueCashbackForOrder } from '../coins/cashback.js'
import { applyCoinTransaction } from '../coins/ledger.js'
import { claimOrdersByEmail, mergeCustomers } from './customers.js'

describe('химикоины: привязка заказов и слияние аккаунтов', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await resetAccountTables()
  })

  const mkCustomer = async (email: string): Promise<Customer> => {
    const repo = AppDataSource.getRepository(Customer)
    return repo.save(repo.create({ email }))
  }
  const balanceOf = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query('SELECT coin_balance FROM customers WHERE id = $1', [id])
    return rows[0].coin_balance
  }
  const sumTransactions = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query(
      'SELECT coalesce(sum(amount), 0)::int AS s FROM coin_transactions WHERE customer_id = $1',
      [id],
    )
    return rows[0].s
  }
  const countTransactions = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query(
      'SELECT count(*)::int AS n FROM coin_transactions WHERE customer_id = $1',
      [id],
    )
    return rows[0].n
  }
  const credit = (customerId: string, amount: number, key: string) =>
    AppDataSource.transaction((em) =>
      applyCoinTransaction(em, { customerId, amount, kind: 'admin_adjust', idempotencyKey: key }),
    )
  const claim = (customerId: string, email: string) =>
    AppDataSource.transaction((em) => claimOrdersByEmail(em, customerId, email))
  const merge = (keepId: string, dropId: string) =>
    AppDataSource.transaction((em) => mergeCustomers(em, keepId, dropId))

  describe('claimOrdersByEmail', () => {
    it('гостевой заказ получен до входа: кэшбек начисляется при привязке, повтор не удваивает', async () => {
      const customer = await mkCustomer('buyer@test.local')
      await seedOrder({
        status: 'delivered',
        customerId: null,
        customerEmail: 'buyer@test.local',
        cashbackPromisedCoins: 190,
      })
      await claim(customer.id, 'buyer@test.local')
      expect(await balanceOf(customer.id)).toBe(190)
      await claim(customer.id, 'buyer@test.local')
      expect(await balanceOf(customer.id)).toBe(190)
      expect(await countTransactions(customer.id)).toBe(1)
    })

    it('привязанный, но не полученный заказ: баланс 0, начислится при delivered', async () => {
      const customer = await mkCustomer('buyer@test.local')
      const order = await seedOrder({
        status: 'shipped',
        customerId: null,
        customerEmail: 'buyer@test.local',
        cashbackPromisedCoins: 190,
      })
      await claim(customer.id, 'buyer@test.local')
      expect(await balanceOf(customer.id)).toBe(0)
      const fresh = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
      expect(fresh.customerId).toBe(customer.id)
      fresh.status = 'delivered'
      await saveOrderWithStatusEvent(fresh, 'shipped')
      expect(await balanceOf(customer.id)).toBe(190)
    })

    it('уже начисленный заказ другого покупателя не перехватывается и не начисляется повторно', async () => {
      const customer = await mkCustomer('buyer@test.local')
      const other = await mkCustomer('other@test.local')
      await seedOrder({
        status: 'delivered',
        customerId: other.id,
        customerEmail: 'buyer@test.local',
        cashbackPromisedCoins: 190,
      })
      await claim(customer.id, 'buyer@test.local')
      expect(await balanceOf(customer.id)).toBe(0)
      expect(await balanceOf(other.id)).toBe(0)
    })
  })

  describe('mergeCustomers', () => {
    it('складывает балансы и переносит историю на keep', async () => {
      const keep = await mkCustomer('keep@test.local')
      const drop = await mkCustomer('drop@test.local')
      await credit(keep.id, 100, 'k1')
      await credit(drop.id, 250, 'd1')
      await merge(keep.id, drop.id)
      expect(await balanceOf(keep.id)).toBe(350)
      expect(await sumTransactions(keep.id)).toBe(350)
      expect(await countTransactions(keep.id)).toBe(2)
      expect(await countTransactions(drop.id)).toBe(0)
      const gone = await AppDataSource.query('SELECT 1 FROM customers WHERE id = $1', [drop.id])
      expect(gone).toHaveLength(0)
    })

    it('слияние без монет у удаляемого не ломает баланс keep', async () => {
      const keep = await mkCustomer('keep@test.local')
      const drop = await mkCustomer('drop@test.local')
      await credit(keep.id, 100, 'k1')
      await merge(keep.id, drop.id)
      expect(await balanceOf(keep.id)).toBe(100)
    })

    it('заказ drop с уже начисленным кэшбеком переезжает; отмена отзывает с баланса keep', async () => {
      const keep = await mkCustomer('keep@test.local')
      const drop = await mkCustomer('drop@test.local')
      await credit(keep.id, 100, 'k1')
      const order = await seedOrder({
        status: 'shipped',
        customerId: drop.id,
        cashbackPromisedCoins: 190,
      })
      const o = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
      o.status = 'delivered'
      await saveOrderWithStatusEvent(o, 'shipped')
      expect(await balanceOf(drop.id)).toBe(190)

      await merge(keep.id, drop.id)
      expect(await balanceOf(keep.id)).toBe(290)
      const moved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
      expect(moved.customerId).toBe(keep.id)

      moved.status = 'cancelled'
      await saveOrderWithStatusEvent(moved, 'delivered')
      expect(await balanceOf(keep.id)).toBe(100)
      expect(await sumTransactions(keep.id)).toBe(100)
    })
  })

  describe('accrueCashbackForOrder', () => {
    it('покупателя уже нет: тихо выходит, ничего не начисляет и не бросает', async () => {
      const ghost = Object.assign(new Order(), {
        id: randomUUID(),
        status: 'delivered',
        customerId: randomUUID(),
        cashbackPromisedCoins: 190,
      }) as Order
      await expect(
        AppDataSource.transaction((em) => accrueCashbackForOrder(em, ghost)),
      ).resolves.toBeUndefined()
      const rows = await AppDataSource.query('SELECT count(*)::int AS n FROM coin_transactions')
      expect(rows[0].n).toBe(0)
    })
  })
})
