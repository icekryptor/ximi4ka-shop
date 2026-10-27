import type { TrafficStatus } from '@ximi4ka-shop/shared'
import { syncBannerState } from './syncBanner'

const WARN = 'rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900'

function formatMsk(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function SyncStatusBanner({ status, now }: { status: TrafficStatus; now: Date }) {
  const state = syncBannerState(status, now)
  switch (state.kind) {
    case 'not_configured':
      return (
        <div className={WARN}>
          Синхронизация не настроена: нужен токен YANDEX_STATS_OAUTH_TOKEN и
          SEARCH_STATS_SYNC_ENABLED=true (deploy/README.md, «Статистика трафика в админке»).
        </div>
      )
    case 'pending':
      return <div className={WARN}>Первая синхронизация с Метрикой ещё не прошла.</div>
    case 'error':
      return <div className={WARN}>Синхронизация с Метрикой не удалась: {state.message}</div>
    case 'stale':
      return (
        <div className={WARN}>
          Данные устарели: последнее обновление {formatMsk(state.lastSuccessAt)}.
        </div>
      )
    case 'ok':
      return (
        <p className="text-sm text-brand-text-secondary">
          Данные на вчера, обновлено {formatMsk(state.lastSuccessAt)}
          {status.dataSince ? `; есть с ${status.dataSince.split('-').reverse().join('.')}` : ''}.
        </p>
      )
  }
}
