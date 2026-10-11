import { describe, it, expect } from 'vitest'
import { isShipmentStarted } from './orders.js'

const UUID = '11111111-1111-4111-8111-111111111111'
const base = { state: 'queued' as const, cdekUuid: null, submittedAt: null, attempts: 0 }

describe('isShipmentStarted', () => {
  it('нет записи об отправке — не начата', () => {
    expect(isShipmentStarted(null)).toBe(false)
  })
  it('created с uuid — начата', () => {
    expect(isShipmentStarted({ ...base, state: 'created', cdekUuid: UUID })).toBe(true)
  })
  it('registering — начата', () => {
    expect(isShipmentStarted({ ...base, state: 'registering' })).toBe(true)
  })
  it('только uuid — начата', () => {
    expect(isShipmentStarted({ ...base, cdekUuid: UUID })).toBe(true)
  })
  it('только submittedAt — начата', () => {
    expect(isShipmentStarted({ ...base, submittedAt: new Date() })).toBe(true)
  })
  it('queued, попыток не было, uuid нет — не начата', () => {
    expect(isShipmentStarted(base)).toBe(false)
  })
  it('queued после попытки без uuid — POST мог дойти до СДЭК: начата', () => {
    expect(isShipmentStarted({ ...base, attempts: 1 })).toBe(true)
  })
  it('failed без uuid и submittedAt — не начата', () => {
    expect(isShipmentStarted({ ...base, state: 'failed', attempts: 3 })).toBe(false)
  })
})
