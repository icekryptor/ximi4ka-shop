// Куда вернуть после входа (?next=): только путь на этом же сайте. «//host»,
// «/\host» и схемы браузер понял бы как другой сайт — открытый редирект.
// Управляющие символы (\t \n \r и т.п.) тоже отклоняем: WHATWG URL-парсер
// вырезает их перед разбором, так что «/\t/evil.ru» превратился бы в
// «https://evil.ru/», хотя по строке этого не видно.
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/
export function safeNext(raw: unknown, fallback = '/account'): string {
  if (typeof raw !== 'string' || raw === '') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (CONTROL_CHAR.test(raw)) return fallback
  return raw
}
