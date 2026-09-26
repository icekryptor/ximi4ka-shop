import type { CdekPoint } from '@ximi4ka-shop/shared'

// Сколько пунктов показываем за раз: в Москве их сотни, а длинный список на
// телефоне никто не листает — уточняют запрос (спека §5.1).
export const POINTS_SHOWN = 50

// Нижний регистр, «ё» как «е», знаки препинания и дефисы — пробелы:
// «Пр-т Мира, 108» → «пр т мира 108».
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Поиск по словам (§5.1): каждое слово запроса должно встретиться в коде,
// названии или адресе пункта. У Тильды поиск по подстроке целиком, и
// «мира 108» ничего не находит: у пункта «пр-т Мира, 108» между словами запятая.
export function searchPoints(
  points: CdekPoint[],
  query: string,
  limit = POINTS_SHOWN,
): { matches: CdekPoint[]; total: number } {
  const words = normalizeSearchText(query)
    .split(' ')
    .filter((w) => w !== '')
  const found =
    words.length === 0
      ? points
      : points.filter((p) => {
          const haystack = normalizeSearchText(`${p.code} ${p.name} ${p.address}`)
          return words.every((w) => haystack.includes(w))
        })
  return { matches: found.slice(0, limit), total: found.length }
}

// Регион для строки подсказки города: «Нальчик, городской округ Нальчик,
// Кабардино-Балкария, Россия» → «Кабардино-Балкария» (часть перед страной).
// У «Москва, Россия» региона нет.
export function cityRegion(fullName: string): string | null {
  const parts = fullName
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return parts.length >= 3 ? parts[parts.length - 2]! : null
}
