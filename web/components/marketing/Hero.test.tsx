import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'

describe('<Hero> v3', () => {
  it('renders headline rows with brand-purple emphasis word', () => {
    render(
      <Hero
        eyebrow="Опыты в коробке · Москва, с 2017"
        headlineRows={[
          { text: 'Опыт', emphasis: true },
          { text: 'вместо', offset: true },
          { text: 'объяснений' },
        ]}
        trailLine="— химия, которую держат в руках"
        lead="3 набора. От реакций меди до электролиза."
        primaryCta={{ label: 'Открыть каталог', href: '/catalog' }}
        secondaryCta={{ label: 'Что мы делаем', href: '#manifesto' }}
        tickerItems={['H₂O', 'NaCl']}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Опыт.*вместо.*объяснений/s)
    expect(screen.getByText('— химия, которую держат в руках')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Открыть каталог/ })).toHaveAttribute('href', '/catalog')
  })

  it('emphasis row gets brand-purple italic class', () => {
    const { container } = render(
      <Hero
        eyebrow="x"
        headlineRows={[{ text: 'Опыт', emphasis: true }, { text: 'rest' }]}
        trailLine="t"
        lead="l"
        primaryCta={{ label: 'a', href: '/' }}
      />,
    )
    const emphasisSpan = container.querySelector('.lj-headline-emphasis')
    expect(emphasisSpan).not.toBeNull()
    expect(emphasisSpan?.textContent).toBe('Опыт')
  })
})
