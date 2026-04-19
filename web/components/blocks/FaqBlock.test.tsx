import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { FaqBlock } from './FaqBlock'

afterEach(() => {
  cleanup()
})

describe('FaqBlock', () => {
  const items = [
    { question: 'Как доставляете?', answer: 'Курьером и Почтой России.' },
    { question: 'Есть ли возврат?', answer: 'Да, в течение 14 дней.' },
  ]

  it('renders a <details>/<summary> per item with question and answer text', () => {
    const { container } = render(<FaqBlock block={{ type: 'faq', items }} />)
    const detailsList = container.querySelectorAll('details')
    expect(detailsList.length).toBe(2)
    expect(detailsList[0].querySelector('summary')?.textContent).toContain('Как доставляете?')
    expect(detailsList[0].textContent).toContain('Курьером и Почтой России.')
    expect(detailsList[1].querySelector('summary')?.textContent).toContain('Есть ли возврат?')
  })

  it('emits a FAQPage JSON-LD script tag containing every question', () => {
    const { container } = render(<FaqBlock block={{ type: 'faq', items }} />)
    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const json = JSON.parse(script!.textContent!) as {
      '@context': string
      '@type': string
      mainEntity: Array<{
        '@type': string
        name: string
        acceptedAnswer: { '@type': string; text: string }
      }>
    }
    expect(json['@context']).toBe('https://schema.org')
    expect(json['@type']).toBe('FAQPage')
    expect(json.mainEntity.length).toBe(2)
    expect(json.mainEntity[0].name).toBe('Как доставляете?')
    expect(json.mainEntity[0].acceptedAnswer.text).toBe('Курьером и Почтой России.')
    expect(json.mainEntity[0]['@type']).toBe('Question')
    expect(json.mainEntity[0].acceptedAnswer['@type']).toBe('Answer')
  })

  it('renders nothing when items is empty', () => {
    const { container } = render(<FaqBlock block={{ type: 'faq', items: [] }} />)
    expect(container.querySelector('[data-block="faq"]')).toBeNull()
  })
})
