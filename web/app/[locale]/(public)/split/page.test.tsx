import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import SplitGuidePage, { generateMetadata } from './page'

const ru = { params: Promise.resolve({ locale: 'ru' }) }

describe('SplitGuidePage', () => {
  it('is an async Server Component', () => {
    expect(SplitGuidePage.constructor.name).toBe('AsyncFunction')
  })

  it('отдаёт title с брендом, описание до 160 символов и canonical на /split', async () => {
    const meta = await generateMetadata(ru)
    expect(meta.title).toBe('Как оплатить в Сплит — Химичка')
    expect(String(meta.description).length).toBeGreaterThan(80)
    expect(String(meta.description).length).toBeLessThanOrEqual(160)
    expect(String(meta.alternates?.canonical)).toMatch(/\/split$/)
  })

  it('для английской локали canonical с префиксом /en', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(String(meta.alternates?.canonical)).toMatch(/\/en\/split$/)
  })

  it('неизвестная локаль даёт 404', async () => {
    await expect(SplitGuidePage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
    await expect(generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
  })

  it('один h1, крошки и пошаговая последовательность оплаты', async () => {
    render(await SplitGuidePage(ru))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Как оплатить в Сплит')
    const crumbs = screen.getByRole('navigation', { name: 'breadcrumbs' })
    expect(within(crumbs).getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/')
    const steps = within(screen.getByRole('list', { name: 'Шаги оплаты в Сплит' })).getAllByRole(
      'listitem',
    )
    expect(steps.length).toBeGreaterThanOrEqual(5)
    expect(steps[0]).toHaveTextContent('Сплит — оплата частями')
    expect(steps[0]).toHaveTextContent('Оформить заказ')
  })

  it('условия и разделы: кому доступно, после покупки, если не одобрили, возврат', async () => {
    render(await SplitGuidePage(ru))
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(h2).toEqual(
      expect.arrayContaining([
        'Как оплатить',
        'Кому доступен Сплит',
        'После покупки',
        'Если Сплит не одобрили',
        'Возврат',
      ]),
    )
    expect(screen.getByText(/4 платежа за 2 месяца без переплат/)).toBeInTheDocument()
  })

  it('кто предоставляет Сплит и официальные правила Яндекса — со ссылками', async () => {
    render(await SplitGuidePage(ru))
    expect(screen.getByText(/ООО «Финансовые и платежные технологии»/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Правила сервиса рассрочки/ })).toHaveAttribute(
      'href',
      'https://yandex.ru/legal/pravilarassrochki',
    )
    expect(screen.getByRole('link', { name: /Справка Сплита/ })).toHaveAttribute(
      'href',
      'https://yandex.ru/support/split/ru/',
    )
  })
})
