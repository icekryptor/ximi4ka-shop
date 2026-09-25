import { describe, it, expect } from 'vitest'
import { parseTildaYmlOffers, planShippingImport, SHIPPING_OVERRIDES } from './tilda-shipping.js'

const YML = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2026-09-23T14:15:33+03:00"><shop><offers>
  <offer id="279167718312">
    <name>Химичка 3.0</name>
    <vendorCode>7V25</vendorCode>
    <description><![CDATA[Набор <b>161 в 1</b>]]></description>
    <price>3299.00</price>
    <oldprice>3500.00</oldprice>
    <weight>1.3</weight>
    <dimensions>41/34/0.7</dimensions>
  </offer>
  <offer id="877687468952">
    <name>Сульфат алюминия</name>
    <vendorCode>AL2SO43</vendorCode>
    <price>69.00</price>
    <weight>0.05</weight>
  </offer>
  <offer id="733888482762">
    <name>Магний</name>
    <vendorCode>MGS</vendorCode>
    <price>99.00</price>
  </offer>
  <offer id="533323024993">
    <name>Запас всех реактивов по 1 шт</name>
    <price>3999.00</price>
    <weight>3</weight>
  </offer>
</offers></shop></yml_catalog>`

describe('parseTildaYmlOffers', () => {
  it('разбирает id, название, артикул, цены и вес в граммах', () => {
    const [himichka, alum] = parseTildaYmlOffers(YML)
    expect(himichka).toEqual({
      id: '279167718312',
      name: 'Химичка 3.0',
      sku: '7V25',
      priceRub: 3299,
      oldPriceRub: 3500,
      weightG: 1300,
    })
    expect(alum).toMatchObject({ priceRub: 69, oldPriceRub: null, weightG: 50 })
  })

  it('оставляет вес пустым, если его нет в фиде', () => {
    const magnesium = parseTildaYmlOffers(YML).find((o) => o.sku === 'MGS')
    expect(magnesium?.weightG).toBeNull()
  })

  it('не путает теги внутри CDATA описания с полями оффера', () => {
    expect(parseTildaYmlOffers(YML)).toHaveLength(4)
  })
})

describe('planShippingImport', () => {
  const idMap = {
    '279167718312': 'himichka-30',
    '877687468952': 'sulfat-alyuminiya',
    '733888482762': 'magnii',
  }
  const products = [
    { slug: 'himichka-30', priceRub: 3099, compareAtPriceRub: 3500 },
    { slug: 'sulfat-alyuminiya', priceRub: 69, compareAtPriceRub: null },
    { slug: 'magnii', priceRub: 99, compareAtPriceRub: null },
  ]

  it('набор получает свою коробку из таблицы правил, вес — из фида', () => {
    const plan = planShippingImport(parseTildaYmlOffers(YML), idMap, products)
    expect(plan.updates.find((u) => u.slug === 'himichka-30')).toMatchObject({
      weightG: 1300,
      shipBoxes: ['large'],
      looseUnits: 1,
      minBox: null,
    })
  })

  it('обычная мелочь — один предмет без своей коробки', () => {
    const plan = planShippingImport(parseTildaYmlOffers(YML), idMap, products)
    expect(plan.updates.find((u) => u.slug === 'sulfat-alyuminiya')).toMatchObject({
      weightG: 50,
      shipBoxes: [],
      looseUnits: 1,
    })
  })

  it('сообщает о товарах без веса, расхождениях цен и несопоставленных офферах', () => {
    const plan = planShippingImport(parseTildaYmlOffers(YML), idMap, products)
    expect(plan.missingWeight).toEqual(['magnii'])
    expect(plan.priceChanges).toEqual([
      { slug: 'himichka-30', from: 3099, to: 3299, fromOld: 3500, toOld: 3500 },
    ])
    expect(plan.unmapped).toEqual([{ id: '533323024993', name: 'Запас всех реактивов по 1 шт' }])
  })

  it('правила переопределяют вес, если он задан явно', () => {
    const plan = planShippingImport(
      [{ id: '1', name: 'ОГЭ', sku: '7OGE26', priceRub: 1, oldPriceRub: null, weightG: null }],
      { '1': 'bolshoi-nabor-dlya-oge' },
      [{ slug: 'bolshoi-nabor-dlya-oge', priceRub: 1, compareAtPriceRub: null }],
    )
    expect(plan.updates[0].weightG).toBe(SHIPPING_OVERRIDES['bolshoi-nabor-dlya-oge'].weightG)
    expect(plan.missingWeight).toEqual([])
  })
})

describe('planShippingImport — товары вне фида', () => {
  it('применяет правило к товару с правилом, которого нет в фиде Тильды', () => {
    const plan = planShippingImport([], {}, [
      { slug: 'bolshoi-nabor-dlya-oge', priceRub: 1, compareAtPriceRub: null },
    ])
    expect(plan.updates).toEqual([
      expect.objectContaining({ slug: 'bolshoi-nabor-dlya-oge', shipBoxes: ['large'] }),
    ])
  })
})
