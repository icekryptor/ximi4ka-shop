// Разбор чисел, введённых в ячейки таблицы товаров. Пробелы (в том числе
// неразрывные из toLocaleString) допускаются как разделители разрядов.
// 'invalid' — ввод не принят: ячейка покажет ошибку и вернёт прежнее значение.
export function parseIntegerInput(
  raw: string,
  opts: { nullable?: boolean; min?: number } = {},
): number | null | 'invalid' {
  const cleaned = raw.replace(/[\s  ]/g, '')
  if (cleaned === '') return opts.nullable ? null : 'invalid'
  if (!/^-?\d+$/.test(cleaned)) return 'invalid'
  const n = Number(cleaned)
  if (!Number.isSafeInteger(n)) return 'invalid'
  if (opts.min !== undefined && n < opts.min) return 'invalid'
  return n
}
