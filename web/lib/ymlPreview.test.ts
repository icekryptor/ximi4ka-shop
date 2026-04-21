import { describe, it, expect } from 'vitest'
import { validateYmlPreview } from './ymlPreview'

const VALID_MIN = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2026-04-20 09:00">
  <shop>
    <name>S</name>
    <company>C</company>
    <url>https://x.ru</url>
    <currencies>
      <currency id="RUB" rate="1"/>
    </currencies>
    <categories>
      <category id="1">A</category>
    </categories>
    <offers>
      <offer id="abc" available="true">
        <url>https://x.ru/p</url>
        <price>100</price>
        <currencyId>RUB</currencyId>
        <categoryId>1</categoryId>
        <name>Test</name>
      </offer>
    </offers>
  </shop>
</yml_catalog>`

describe('validateYmlPreview', () => {
  it('returns ok=true for a well-formed, complete feed', () => {
    const r = validateYmlPreview(VALID_MIN)
    expect(r.ok).toBe(true)
    expect(r.offersCount).toBe(1)
    expect(r.issues).toEqual([])
  })

  it('flags malformed XML', () => {
    const r = validateYmlPreview('<yml_catalog><shop><oops')
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => /parse error/i.test(i))).toBe(true)
  })

  it('flags a missing required offer child', () => {
    const bad = VALID_MIN.replace('<categoryId>1</categoryId>', '')
    const r = validateYmlPreview(bad)
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toMatch(/missing <categoryId>/)
  })

  it('flags an empty offers list', () => {
    const empty = VALID_MIN.replace(
      /<offers>[\s\S]*?<\/offers>/,
      '<offers></offers>',
    )
    const r = validateYmlPreview(empty)
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toMatch(/No offers/)
    expect(r.offersCount).toBe(0)
  })

  it('flags a non-numeric price', () => {
    const bad = VALID_MIN.replace('<price>100</price>', '<price>abc</price>')
    const r = validateYmlPreview(bad)
    expect(r.ok).toBe(false)
    expect(r.issues.join(' ')).toMatch(/not a positive number/)
  })
})
