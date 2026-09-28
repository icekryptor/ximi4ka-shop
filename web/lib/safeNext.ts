// Куда вернуть после входа (?next=): только путь на этом же сайте. «//host»,
// «/\host» и схемы браузер понял бы как другой сайт — открытый редирект.
export function safeNext(raw: unknown, fallback = '/account'): string {
  if (typeof raw !== 'string' || raw === '') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
