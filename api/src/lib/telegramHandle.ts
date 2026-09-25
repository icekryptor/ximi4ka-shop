// Ник Telegram покупателя: принимаем так, как пишут люди — «maria»,
// «@maria», «t.me/maria», — храним одинаково: «@maria». Правила ника у
// Telegram: латиница, цифры и _, от 5 до 32 символов. null — не ник.
const HANDLE_RE = /^[A-Za-z0-9_]{5,32}$/

export function normalizeTelegramHandle(raw: string): string | null {
  const bare = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
  return HANDLE_RE.test(bare) ? `@${bare}` : null
}
