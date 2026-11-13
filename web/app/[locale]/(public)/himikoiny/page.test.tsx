import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const settings = vi.hoisted(() => ({ coins: null as { cashbackPercent: number } | null }))
vi.mock('@/lib/api', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api')>()),
  getPublicSettings: async () => ({ coins: settings.coins }),
}))

import HimikoinyPage, { generateMetadata } from './page'

const ru = { params: Promise.resolve({ locale: 'ru' }) }

describe('HimikoinyPage', () => {
  beforeEach(() => {
    settings.coins = { cashbackPercent: 10 }
  })

  it('программа выключена — 404', async () => {
    settings.coins = null
    await expect(HimikoinyPage(ru)).rejects.toThrow()
  })

  it('неизвестная локаль — 404', async () => {
    await expect(HimikoinyPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
  })

  it('процент берётся из настроек', async () => {
    settings.coins = { cashbackPercent: 7 }
    render(await HimikoinyPage(ru))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Химикоины')
    expect(screen.getByText(/кэшбек 7%/i)).toBeInTheDocument()
    expect(screen.queryByText(/10%/)).toBeNull()
  })

  it('нет запрещённых слов, есть ссылка в кабинет', async () => {
    render(await HimikoinyPage(ru))
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/детям|ребёнк|игрушк/i)
    expect(screen.getByRole('link', { name: /кабинет/i })).toHaveAttribute('href', '/account')
  })

  it('metadata: noindex', async () => {
    const meta = await generateMetadata(ru)
    expect(meta.robots).toMatchObject({ index: false })
  })
})
