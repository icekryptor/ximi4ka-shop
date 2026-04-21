// Client-side structural validator for the YML feed preview panel.
//
// NOTE on scope: Yandex publishes a DTD (not an XSD), and running full DTD
// validation in the browser would pull in a sizeable parser dependency for
// essentially one button. Instead we do a hand-rolled structural check
// against the subset of the spec our generator actually emits — missing
// <categoryId>, missing required children, empty <offers>, and malformed
// prices. That catches the realistic class of bugs the admin cares about
// (e.g. "why did Yandex reject my feed?") without the weight of a real
// validator. If we ever need full DTD compliance, that belongs in a build
// step, not the admin UI.

export interface YmlPreviewReport {
  ok: boolean
  offersCount: number
  issues: string[]
  /** Snippet shown inside the <details> panel — first 20 offers, pretty-indented. */
  snippet: string
}

const REQUIRED_OFFER_CHILDREN = [
  'url',
  'price',
  'currencyId',
  'categoryId',
  'name',
]

export function validateYmlPreview(xml: string): YmlPreviewReport {
  const issues: string[] = []

  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  // DOMParser reports errors by inserting a <parsererror> node rather than
  // throwing. Check for that first; a malformed feed is the only failure
  // mode where "count offers" is meaningless.
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return {
      ok: false,
      offersCount: 0,
      issues: ['XML parse error — feed is not well-formed'],
      snippet: xml.slice(0, 2000),
    }
  }

  const catalog = doc.querySelector('yml_catalog')
  if (!catalog) issues.push('Missing root <yml_catalog> element')

  const shop = doc.querySelector('yml_catalog > shop')
  if (!shop) issues.push('Missing <shop> element')

  const currencies = doc.querySelector('shop > currencies')
  if (!currencies) issues.push('Missing <currencies> element')

  const categories = doc.querySelector('shop > categories')
  if (!categories) issues.push('Missing <categories> element')

  const offersNode = doc.querySelector('shop > offers')
  if (!offersNode) issues.push('Missing <offers> element')

  const offers = doc.querySelectorAll('shop > offers > offer')
  if (offers.length === 0) {
    issues.push('No offers found — feed will be empty in Yandex Market')
  }

  offers.forEach((offer, i) => {
    const id = offer.getAttribute('id') ?? `#${i + 1}`
    for (const tag of REQUIRED_OFFER_CHILDREN) {
      if (!offer.querySelector(tag)) {
        issues.push(`Offer ${id}: missing <${tag}>`)
      }
    }
    const priceText = offer.querySelector('price')?.textContent?.trim() ?? ''
    if (priceText && !/^\d+(\.\d+)?$/.test(priceText)) {
      issues.push(`Offer ${id}: price "${priceText}" is not a positive number`)
    }
  })

  // Build the snippet: first 20 offers rendered back out so the admin has
  // something concrete to eyeball. Using outerHTML keeps the view honest
  // about exactly what Yandex will see.
  const sample = Array.from(offers).slice(0, 20)
  const snippet = sample.map((o) => new XMLSerializer().serializeToString(o)).join('\n\n')

  return {
    ok: issues.length === 0,
    offersCount: offers.length,
    issues,
    snippet: snippet || xml.slice(0, 2000),
  }
}
