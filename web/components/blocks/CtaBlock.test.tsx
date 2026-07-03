import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { CtaBlock } from './CtaBlock'

afterEach(() => {
  cleanup()
})

describe('<CtaBlock> v3', () => {
  it('renders heading, subtext, and ink-pill CTA link', () => {
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
    const link = scope.getByRole('link', { name: /К товарам/ })
    expect(link).toHaveAttribute('href', '/categories')
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

  it('omits subtext paragraph when not provided', () => {
    const { container } = render(
      <CtaBlock
        block={{ type: 'cta', heading: 'x', buttonLabel: 'go', buttonHref: '/' }}
      />,
    )
    expect(container.querySelector('p')).toBeNull()
  })

  it('preserves data-block="cta" marker for BlockRenderer contract', () => {
    const { container } = render(
      <CtaBlock
        block={{ type: 'cta', heading: 'x', buttonLabel: 'go', buttonHref: '/' }}
      />,
    )
    expect(container.querySelector('[data-block="cta"]')).not.toBeNull()
  })

  it('applies v3 ink-pill CTA classes (matches Hero ink-pill)', () => {
    const { container } = render(
      <CtaBlock
        block={{ type: 'cta', heading: 'x', buttonLabel: 'go', buttonHref: '/' }}
      />,
    )
    const link = within(container).getByRole('link')
    expect(link.className).toContain('rounded-full')
    expect(link.className).toContain('bg-[var(--color-lj-ink)]')
    expect(link.className).toContain('text-[var(--color-lj-bone)]')
    expect(link.className).toContain('font-lj-mono')
    expect(link.className).toContain('uppercase')
    expect(link.className).toContain('hover:bg-[var(--color-lj-brand-deep)]')
  })

  it('uses lab-journal display font for heading', () => {
    const { container } = render(
      <CtaBlock
        block={{ type: 'cta', heading: 'Heading', buttonLabel: 'go', buttonHref: '/' }}
      />,
    )
    const heading = within(container).getByText('Heading')
    expect(heading.className).toContain('font-lj-display')
  })
})
