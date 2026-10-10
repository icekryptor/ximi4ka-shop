import type { YcpLine } from './pricing.js'

export interface YcpBasketItem {
  id: string
  name: string
  regular_price: number
  final_price: number
  img?: string
  url?: string
  warehouses: { id: string; available_quantity: number }[]
  dimensions: { width: number; height: number; depth: number; weight: number }
  characteristics: never[]
  variations: never[]
}

function safeUrl(value: string | null | undefined, origin: string): string | undefined {
  if (!value?.trim()) return undefined
  try {
    return new URL(value.trim(), `${origin}/`).toString()
  } catch {
    return undefined
  }
}

// Товар для basket/check (схема BasketItem). vat не передаём — Яндекс
// подставит 22 (налоговый режим — вопрос владельца, docs/ycp/RUNBOOK.md).
// Размеры — в мм, вес — в граммах; вариантов и характеристик у нас нет.
export function ycpBasketItem(line: YcpLine, warehouseId: string, origin: string): YcpBasketItem {
  const p = line.product
  const image = [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  const img = safeUrl(image?.url, origin)
  const s = line.shipping
  return {
    id: p.id,
    name: p.name,
    regular_price: line.regularPriceRub,
    final_price: line.finalPriceRub,
    ...(img ? { img } : {}),
    url: safeUrl(p.canonicalUrl, origin) ?? `${origin}/product/${encodeURIComponent(p.slug)}`,
    warehouses: [{ id: warehouseId, available_quantity: line.availableQuantity }],
    dimensions: {
      width: s.widthCm * 10,
      height: s.heightCm * 10,
      depth: s.lengthCm * 10,
      weight: s.weightG,
    },
    characteristics: [],
    variations: [],
  }
}
