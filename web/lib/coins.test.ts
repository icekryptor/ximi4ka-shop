import { describe, it, expect } from 'vitest'
import {
  avatarInitial,
  coinOperationLabel,
  coinsWord,
  formatCoins,
  formatSignedCoins,
  orderCashbackNote,
} from './coins'

describe('coins helpers', () => {
  it('coinsWord склоняет по числу', () => {
    expect(coinsWord(1)).toBe('химикоин')
    expect(coinsWord(3)).toBe('химикоина')
    expect(coinsWord(5)).toBe('химикоинов')
    expect(coinsWord(11)).toBe('химикоинов')
    expect(coinsWord(21)).toBe('химикоин')
    expect(coinsWord(0)).toBe('химикоинов')
  })
  it('formatCoins разделяет разряды', () => {
    expect(formatCoins(1900)).toBe('1 900')
    expect(formatCoins(12345)).toBe('12 345')
    expect(formatCoins(190)).toBe('190')
  })
  it('avatarInitial берёт заглавную букву имени или почты', () => {
    expect(avatarInitial('рената', null)).toBe('Р')
    expect(avatarInitial(null, 'buyer@test.local')).toBe('B')
    expect(avatarInitial('  ', null)).toBe('?')
  })
})

describe('coinOperationLabel', () => {
  it('подписи трёх видов операций', () => {
    expect(coinOperationLabel('order_cashback', 'XM-1')).toBe('Кэшбек за заказ №XM-1')
    expect(coinOperationLabel('order_cashback_revoke', 'XM-1')).toBe('Отмена заказа №XM-1')
    expect(coinOperationLabel('admin_adjust', null)).toBe('Корректировка')
    expect(coinOperationLabel('admin_adjust', 'XM-1')).toBe('Корректировка')
  })
  it('без номера заказа часть «№…» опускается', () => {
    expect(coinOperationLabel('order_cashback', null)).toBe('Кэшбек за заказ')
    expect(coinOperationLabel('order_cashback_revoke', null)).toBe('Отмена заказа')
  })
})

describe('formatSignedCoins', () => {
  it('явный знак, настоящий минус', () => {
    expect(formatSignedCoins(190)).toBe('+190')
    expect(formatSignedCoins(-1500)).toBe('\u22121 500')
    expect(formatSignedCoins(0)).toBe('0')
  })
})

describe('orderCashbackNote', () => {
  const o = (status: string, promised: number, accrued: boolean) =>
    ({ status, cashbackPromisedCoins: promised, cashbackAccrued: accrued }) as never
  it('paid / shipped с обещанием — «после получения»', () => {
    expect(orderCashbackNote(o('paid', 190, false))).toBe('+190 химикоинов после получения')
    expect(orderCashbackNote(o('shipped', 1, false))).toBe('+1 химикоин после получения')
    expect(orderCashbackNote(o('paid', 3, false))).toBe('+3 химикоина после получения')
    expect(orderCashbackNote(o('paid', 1200, false))).toBe('+1 200 химикоинов после получения')
  })
  it('paid / shipped без обещания — ничего', () => {
    expect(orderCashbackNote(o('paid', 0, false))).toBeNull()
    expect(orderCashbackNote(o('shipped', 0, false))).toBeNull()
  })
  it('delivered с начислением — «Начислено»', () => {
    expect(orderCashbackNote(o('delivered', 190, true))).toBe('Начислено 190 химикоинов')
    expect(orderCashbackNote(o('delivered', 21, true))).toBe('Начислено 21 химикоин')
    expect(orderCashbackNote(o('delivered', 2, true))).toBe('Начислено 2 химикоина')
  })
  it('delivered без начисления — ничего', () => {
    expect(orderCashbackNote(o('delivered', 190, false))).toBeNull()
    expect(orderCashbackNote(o('delivered', 0, false))).toBeNull()
  })
  it('cancelled / failed / pending — ничего, даже если начисление отмечено', () => {
    for (const st of ['cancelled', 'failed', 'pending']) {
      expect(orderCashbackNote(o(st, 190, true))).toBeNull()
      expect(orderCashbackNote(o(st, 190, false))).toBeNull()
    }
  })
})
