import type { ShippingBox } from '@ximi4ka-shop/shared'

// Импорт данных для доставки из YML-фида Тильды. Фид машинный и однотипный,
// поэтому разбираем его регулярными выражениями, а не тянем XML-парсер ради
// шести полей. Описание (<description>) лежит в CDATA и может содержать
// HTML — его вырезаем до разбора, чтобы теги внутри не спутать с полями.

export interface TildaOffer {
  id: string
  name: string
  sku: string | null
  priceRub: number
  oldPriceRub: number | null
  weightG: number | null
}

function tag(body: string, name: string): string | null {
  const m = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m ? m[1].trim() : null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function parseTildaYmlOffers(xml: string): TildaOffer[] {
  const withoutCdata = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  const offers: TildaOffer[] = []
  for (const m of withoutCdata.matchAll(/<offer id="(\d+)"[^>]*>([\s\S]*?)<\/offer>/g)) {
    const [, id, body] = m
    const price = tag(body, 'price')
    const oldPrice = tag(body, 'oldprice')
    const weight = tag(body, 'weight')
    offers.push({
      id,
      name: decodeEntities(tag(body, 'name') ?? ''),
      sku: tag(body, 'vendorCode'),
      priceRub: Math.round(Number(price ?? 0)),
      oldPriceRub: oldPrice ? Math.round(Number(oldPrice)) : null,
      // В фиде вес в килограммах.
      weightG: weight ? Math.round(Number(weight) * 1000) : null,
    })
  }
  return offers
}

export interface ShippingRule {
  shipBoxes?: ShippingBox[]
  looseUnits?: number
  minBox?: ShippingBox | null
  // Задаётся, только если в фиде веса нет или он заведомо неверный.
  weightG?: number
}

// Как товары едут (решение владельца от 23.09.2026, см.
// docs/plans/2026-09-23-cdek-delivery-design.md): наборы — в своих коробках
// отдельными местами, мелочь — по числу предметов. Всё, чего нет в таблице, —
// обычная мелочь в один предмет.
export const SHIPPING_OVERRIDES: Record<string, ShippingRule> = {
  'himichka-30': { shipBoxes: ['large'] },
  elektrohimichka: { shipBoxes: ['elektro'] },
  'mini-himichka': { shipBoxes: ['medium'] },
  'himichka-i-elektrohimichka': { shipBoxes: ['large', 'elektro'] },
  'vse-tri-nabora': { shipBoxes: ['large', 'elektro', 'medium'] },
  // Нет в фиде Тильды (скоро в наличии). Вес — оценка по Химичке 3.0,
  // уточнить после первой отгрузки.
  'bolshoi-nabor-dlya-oge': { shipBoxes: ['large'], weightG: 1300 },
  // Все реактивы разом — «крупная посылка от 15 предметов».
  'zapas-vseh-reaktivov': { looseUnits: 16 },
  'tri-kisloti': { looseUnits: 3 },
  // Формат 21×14 см в малую и среднюю коробку не влезает.
  'himichka-metodichka': { minBox: 'large' },
  elektrometodichka: { minBox: 'large' },
  'tablitsa-mendeleeva-i-rastvorimosti': { minBox: 'large' },
}

export interface ProductRow {
  slug: string
  priceRub: number
  compareAtPriceRub: number | null
}

export interface ShippingUpdate {
  slug: string
  weightG: number | null
  shipBoxes: ShippingBox[]
  looseUnits: number
  minBox: ShippingBox | null
}

export interface ShippingImportPlan {
  updates: ShippingUpdate[]
  missingWeight: string[]
  priceChanges: {
    slug: string
    from: number
    to: number
    fromOld: number | null
    toOld: number | null
  }[]
  unmapped: { id: string; name: string }[]
}

function updateFor(slug: string, feedWeightG: number | null): ShippingUpdate {
  const rule = SHIPPING_OVERRIDES[slug] ?? {}
  return {
    slug,
    weightG: rule.weightG ?? feedWeightG,
    shipBoxes: rule.shipBoxes ?? [],
    looseUnits: rule.looseUnits ?? 1,
    minBox: rule.minBox ?? null,
  }
}

export function planShippingImport(
  offers: TildaOffer[],
  idMap: Record<string, string>,
  products: ProductRow[],
): ShippingImportPlan {
  const bySlug = new Map(products.map((p) => [p.slug, p]))
  const plan: ShippingImportPlan = {
    updates: [],
    missingWeight: [],
    priceChanges: [],
    unmapped: [],
  }
  const seen = new Set<string>()

  for (const offer of offers) {
    const slug = idMap[offer.id]
    const product = slug ? bySlug.get(slug) : undefined
    if (!slug || !product) {
      plan.unmapped.push({ id: offer.id, name: offer.name })
      continue
    }
    seen.add(slug)
    const update = updateFor(slug, offer.weightG)
    plan.updates.push(update)
    if (update.weightG == null) plan.missingWeight.push(slug)
    if (product.priceRub !== offer.priceRub || product.compareAtPriceRub !== offer.oldPriceRub) {
      plan.priceChanges.push({
        slug,
        from: product.priceRub,
        to: offer.priceRub,
        fromOld: product.compareAtPriceRub,
        toOld: offer.oldPriceRub,
      })
    }
  }

  // Правила для товаров, которых в фиде нет (например, ОГЭ-набор).
  for (const slug of Object.keys(SHIPPING_OVERRIDES)) {
    if (seen.has(slug) || !bySlug.has(slug)) continue
    const update = updateFor(slug, null)
    plan.updates.push(update)
    if (update.weightG == null) plan.missingWeight.push(slug)
  }

  return plan
}
