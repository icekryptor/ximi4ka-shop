import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { resetAccountTables } from '../../routes/testUtils.js'
import {
  applyCoinTransaction,
  InsufficientCoinsError,
  listCoinTransactions,
  type CoinTransactionInput,
} from './ledger.js'

describe('история химикоинов', () => {
  let customerId: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await resetAccountTables()
    const customer = await AppDataSource.getRepository(Customer).save(
      AppDataSource.getRepository(Customer).create({ email: 'coins@example.com' }),
    )
    customerId = customer.id
  })

  const apply = (input: Partial<CoinTransactionInput> & { amount: number }) =>
    AppDataSource.transaction((em) =>
      applyCoinTransaction(em, {
        customerId,
        kind: 'admin_adjust',
        idempotencyKey: 'default-key',
        ...input,
      }),
    )

  const balanceOf = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query('SELECT coin_balance FROM customers WHERE id = $1', [id])
    return rows[0].coin_balance
  }
  const countTransactions = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query(
      'SELECT count(*)::int AS n FROM coin_transactions WHERE customer_id = $1',
      [id],
    )
    return rows[0].n
  }
  const sumTransactions = async (id: string): Promise<number> => {
    const rows = await AppDataSource.query(
      'SELECT coalesce(sum(amount), 0)::int AS s FROM coin_transactions WHERE customer_id = $1',
      [id],
    )
    return rows[0].s
  }

  it('начисляет и возвращает новый баланс', async () => {
    expect(await apply({ amount: 190, idempotencyKey: 'k1' })).toEqual({
      applied: true,
      balance: 190,
    })
    expect(await balanceOf(customerId)).toBe(190)
  })

  it('повтор того же ключа ничего не меняет', async () => {
    await apply({ amount: 190, idempotencyKey: 'k1' })
    expect(await apply({ amount: 190, idempotencyKey: 'k1' })).toEqual({
      applied: false,
      balance: 190,
    })
    expect(await countTransactions(customerId)).toBe(1)
  })

  it('не даёт уйти в минус и не пишет историю', async () => {
    await apply({ amount: 190, idempotencyKey: 'k1' })
    await expect(apply({ amount: -191, idempotencyKey: 'k2' })).rejects.toBeInstanceOf(
      InsufficientCoinsError,
    )
    expect(await countTransactions(customerId)).toBe(1)
    expect(await balanceOf(customerId)).toBe(190)
  })

  it('списание в пределах баланса проходит', async () => {
    await apply({ amount: 190, idempotencyKey: 'k1' })
    expect(
      await apply({ amount: -190, idempotencyKey: 'k2', kind: 'order_cashback_revoke' }),
    ).toEqual({ applied: true, balance: 0 })
  })

  it('гонка: два параллельных списания по 150 при 190 — проходит одно', async () => {
    await apply({ amount: 190, idempotencyKey: 'seed' })
    const debit = (key: string) => apply({ amount: -150, idempotencyKey: key })
    const results = await Promise.allSettled([debit('a'), debit('b')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientCoinsError)
    expect(await balanceOf(customerId)).toBe(40)
  })

  it('гонка с одним ключом: применяется один раз', async () => {
    const results = await Promise.all([
      apply({ amount: 100, idempotencyKey: 'same' }),
      apply({ amount: 100, idempotencyKey: 'same' }),
    ])
    expect(results.filter((r) => r.applied)).toHaveLength(1)
    expect(results.map((r) => r.balance)).toEqual([100, 100])
    expect(await balanceOf(customerId)).toBe(100)
  })

  it('инвариант: кэш баланса равен сумме истории', async () => {
    await apply({ amount: 190, idempotencyKey: 'k1' })
    await apply({ amount: 50, idempotencyKey: 'k2' })
    await apply({ amount: -70, idempotencyKey: 'k3' })
    expect(await balanceOf(customerId)).toBe(170)
    expect(await balanceOf(customerId)).toBe(await sumTransactions(customerId))
  })

  it('amount = 0 и нецелый amount отклоняются до обращения к базе', async () => {
    await expect(apply({ amount: 0, idempotencyKey: 'z' })).rejects.toThrow(/amount/)
    await expect(apply({ amount: 1.5, idempotencyKey: 'f' })).rejects.toThrow(/amount/)
    await expect(apply({ amount: NaN, idempotencyKey: 'n' })).rejects.toThrow(/amount/)
    expect(await countTransactions(customerId)).toBe(0)
  })

  it('неизвестный покупатель — ошибка', async () => {
    await expect(
      apply({
        amount: 10,
        idempotencyKey: 'x',
        customerId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toThrow(/не найден/)
  })

  it('listCoinTransactions отдаёт историю от новых к старым', async () => {
    await apply({ amount: 100, idempotencyKey: 'k1', comment: 'первая' })
    await apply({ amount: 20, idempotencyKey: 'k2', comment: 'вторая' })
    const list = await AppDataSource.transaction((em) => listCoinTransactions(em, customerId))
    expect(list.map((t) => t.comment)).toEqual(['вторая', 'первая'])
    const limited = await AppDataSource.transaction((em) => listCoinTransactions(em, customerId, 1))
    expect(limited).toHaveLength(1)
  })
})
