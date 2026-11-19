import { useEffect, useState } from 'react'
import { getPublicSettings } from '@/lib/api'
import { hasSignedInCookie } from '@/lib/signedInHint'

// Программа химикоинов для корзин и чекаута: процент кэшбека из публичных настроек
// (один запрос на загрузку страницы для всех потребителей) и подсказка «вошёл».
// Пока процент не известен — percent: null, строку не показываем; signedIn и percent
// выставляются одновременно, чтобы строка не сменила формулировку после появления.

let cached: Promise<number | null> | null = null

function loadPercent(): Promise<number | null> {
  cached ??= getPublicSettings()
    .then((s) => s?.coins?.cashbackPercent ?? null)
    .catch(() => {
      cached = null // api лежал — следующий монтирующийся потребитель попробует снова
      return null
    })
  return cached
}

/** Только для тестов. */
export function resetCoinsProgramCache(): void {
  cached = null
}

export interface CoinsProgram {
  /** null — программа выключена или настройки ещё не пришли. */
  percent: number | null
  signedIn: boolean
}

export function useCoinsProgram(): CoinsProgram {
  const [state, setState] = useState<CoinsProgram>({ percent: null, signedIn: false })
  useEffect(() => {
    let cancelled = false
    void loadPercent().then((percent) => {
      if (!cancelled) setState({ percent, signedIn: hasSignedInCookie() })
    })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
