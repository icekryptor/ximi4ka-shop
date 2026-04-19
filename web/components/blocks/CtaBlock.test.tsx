import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { CtaBlock } from './CtaBlock'

afterEach(() => {
  cleanup()
})

describe('CtaBlock', () => {
  it('renders heading, subtext, and button label', () => {
    const { container } = render(
      <CtaBlock
        block={{
          type: 'cta',
          heading: 'Купить сейчас',
          subtext: 'Лучшее предложение недели',
          buttonLabel: 'К товарам',
          buttonHref: '/categories',
        }}
      />,
    )
    const scope = within(container)
    expect(scope.getByText('Купить сейчас')).toBeInTheDocument()
    expect(scope.getByText('Лучшее предложение недели')).toBeInTheDocument()
    expect(scope.getByText('К товарам')).toBeInTheDocument()
  })

  it('uses a Next.js Link (relative href, no target) for internal URLs', () => {
    const { container } = render(
      <CtaBlock
        block={{
          type: 'cta',
          heading: 'x',
          buttonLabel: 'go',
          buttonHref: '/categories',
        }}
      />,
    )
    const link = within(container).getByRole('link')
    expect(link.getAttribute('href')).toBe('/categories')
    expect(link.getAttribute('target')).toBeNull()
  })

  it('renders an external anchor with target=_blank rel=noopener for http(s) hrefs', () => {
    const { container } = render(
      <CtaBlock
        block={{
          type: 'cta',
          heading: 'x',
          buttonLabel: 'go',
          buttonHref: 'https://ximi4ka.ru/',
        }}
      />,
    )
    const link = within(container).getByRole('link')
    expect(link.getAttribute('href')).toBe('https://ximi4ka.ru/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('omits subtext when not provided', () => {
    const { container } = render(
      <CtaBlock
        block={{ type: 'cta', heading: 'x', buttonLabel: 'go', buttonHref: '/' }}
      />,
    )
    expect(container.querySelector('p')).toBeNull()
  })
})
