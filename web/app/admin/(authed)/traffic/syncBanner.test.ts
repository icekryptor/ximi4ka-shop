import { describe, it, expect } from 'vitest'
import type { TrafficStatus } from '@ximi4ka-shop/shared'
import { syncBannerState } from './syncBanner'

const NOW = new Date('2026-10-28T12:00:00Z')

function status(
  over: Partial<TrafficStatus['runs'][number]> = {},
  configured = true,
): TrafficStatus {
  return {
    configured,
    dataSince: null,
    dataUntil: null,
    runs: [
      {
        source: 'metrika',
        lastStartedAt: null,
        lastStatus: null,
        lastError: null,
        lastSuccessAt: null,
        ...over,
      },
      {
        source: 'webmaster',
        lastStartedAt: null,
        lastStatus: null,
        lastError: null,
        lastSuccessAt: null,
      },
    ],
  }
}

describe('syncBannerState', () => {
  it('не настроена', () => {
    expect(syncBannerState(status({}, false), NOW)).toEqual({ kind: 'not_configured' })
  })
  it('последний запуск с ошибкой — текст ошибки', () => {
    expect(
      syncBannerState(status({ lastStatus: 'error', lastError: 'Токен отозван' }), NOW),
    ).toEqual({ kind: 'error', message: 'Токен отозван' })
  })
  it('настроена, но успеха ещё не было', () => {
    expect(syncBannerState(status({ lastStatus: 'running' }), NOW)).toEqual({ kind: 'pending' })
  })
  it('успех старше 48 часов — устарели', () => {
    const at = '2026-10-26T11:00:00.000Z'
    expect(syncBannerState(status({ lastStatus: 'ok', lastSuccessAt: at }), NOW)).toEqual({
      kind: 'stale',
      lastSuccessAt: at,
    })
  })
  it('свежий успех', () => {
    const at = '2026-10-28T01:10:00.000Z'
    expect(syncBannerState(status({ lastStatus: 'ok', lastSuccessAt: at }), NOW)).toEqual({
      kind: 'ok',
      lastSuccessAt: at,
    })
  })
})
