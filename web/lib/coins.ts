// Химикоины в витрине: склонение, формат числа, буква аватарки.

export function coinsWord(n: number): 'химикоин' | 'химикоина' | 'химикоинов' {
  const abs = Math.abs(Math.trunc(n))
  const last2 = abs % 100
  const last = abs % 10
  if (last2 >= 11 && last2 <= 14) return 'химикоинов'
  if (last === 1) return 'химикоин'
  if (last >= 2 && last <= 4) return 'химикоина'
  return 'химикоинов'
}

/** 1900 → «1 900». Без Intl: результат одинаков на сервере и в браузере. */
export function formatCoins(n: number): string {
  const s = String(Math.trunc(Math.abs(n)))
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return n < 0 ? `-${grouped}` : grouped
}

/** Заглавная буква имени, иначе почты; '?' если нечего показать. */
export function avatarInitial(name: string | null, email: string | null): string {
  const src = (name ?? '').trim() || (email ?? '').trim()
  const first = Array.from(src)[0]
  return first ? first.toUpperCase() : '?'
}
