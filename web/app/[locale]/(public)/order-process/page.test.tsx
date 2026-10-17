import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import OrderProcessPage, { generateMetadata } from './page'

const ru = { params: Promise.resolve({ locale: 'ru' }) }

describe('OrderProcessPage', () => {
  it('is an async Server Component', () => {
    expect(OrderProcessPage.constructor.name).toBe('AsyncFunction')
  })

  it('отдаёт title с брендом, описание до 160 символов и canonical на /order-process', async () => {
    const meta = await generateMetadata(ru)
    expect(meta.title).toBe('Как проходит заказ и доставка — Химичка')
    expect(String(meta.description).length).toBeGreaterThan(80)
    expect(String(meta.description).length).toBeLessThanOrEqual(160)
    expect(String(meta.alternates?.canonical)).toMatch(/\/order-process$/)
  })

  it('для английской локали canonical с префиксом /en', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(String(meta.alternates?.canonical)).toMatch(/\/en\/order-process$/)
  })

  it('неизвестная локаль даёт 404', async () => {
    await expect(OrderProcessPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
    await expect(generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
  })

  it('выводит один h1, крошки и четыре раздела шагов', async () => {
    render(await OrderProcessPage(ru))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Как проходит заказ')
    const crumbs = screen.getByRole('navigation', { name: 'breadcrumbs' })
    expect(within(crumbs).getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/')
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(h2[0]).toMatch(/^1\./)
    expect(h2.filter((t) => /^[1-4]\./.test(t))).toHaveLength(4)
  })

  it('для английской локали крошки и JSON-LD ведут на /en и /en/order-process', async () => {
    const { container } = render(
      await OrderProcessPage({ params: Promise.resolve({ locale: 'en' }) }),
    )
    const crumbs = screen.getByRole('navigation', { name: 'breadcrumbs' })
    expect(within(crumbs).getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/en')
    const ld = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    )
    const urls: string[] = ld.itemListElement.map((i: { item: string }) => i.item)
    expect(urls[0]).toMatch(/\/en$/)
    expect(urls[1]).toMatch(/\/en\/order-process$/)
  })

  it('показывает четыре скриншота с alt и подписью, условия по странам и сроки СДЭК', async () => {
    const { container } = render(await OrderProcessPage(ru))
    const shots = container.querySelectorAll('figure img')
    expect(shots).toHaveLength(4)
    shots.forEach((img) => expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(20))
    expect(container.querySelectorAll('figure figcaption')).toHaveLength(4)
    expect(
      screen.getByRole('list', { name: 'Условия бесплатной доставки по странам' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Города с пунктами выдачи СДЭК' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Средние сроки доставки СДЭК' })).toBeInTheDocument()
  })

  it('содержит юридическую оговорку дословно и ссылку на оферту', async () => {
    render(await OrderProcessPage(ru))
    expect(
      screen.getByText(
        /Риск случайной гибели или повреждения товара переходит к Покупателю с момента передачи товара службе доставки\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'публичной оферте' })).toHaveAttribute(
      'href',
      '/oferta',
    )
  })

  it('добавляет JSON-LD крошек и ведёт в каталог', async () => {
    const { container } = render(await OrderProcessPage(ru))
    const ld = container.querySelector('script[type="application/ld+json"]')
    expect(ld?.textContent).toContain('BreadcrumbList')
    expect(ld?.textContent).toContain('Как проходит заказ и доставка')
    expect(screen.getByRole('link', { name: 'Открыть каталог' })).toHaveAttribute(
      'href',
      '/categories',
    )
  })
})
