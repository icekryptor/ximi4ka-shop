import type { TrafficStatus } from '@ximi4ka-shop/shared'

const STALE_MS = 48 * 60 * 60 * 1000

export type BannerState =
  | { kind: 'not_configured' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'stale'; lastSuccessAt: string }
  | { kind: 'ok'; lastSuccessAt: string }

// Пока в PR 1 только Метрика: состояние по её журналу.
export function syncBannerState(status: TrafficStatus, now: Date): BannerState {
  if (!status.configured) return { kind: 'not_configured' }
  const run = status.runs.find((r) => r.source === 'metrika')
  if (run?.lastStatus === 'error') {
    return { kind: 'error', message: run.lastError ?? 'Неизвестная ошибка' }
  }
  if (!run?.lastSuccessAt) return { kind: 'pending' }
  if (now.getTime() - Date.parse(run.lastSuccessAt) > STALE_MS) {
    return { kind: 'stale', lastSuccessAt: run.lastSuccessAt }
  }
  return { kind: 'ok', lastSuccessAt: run.lastSuccessAt }
}
