import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const getPublishedProduct = vi.fn()
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, getPublishedProduct: (slug: string) => getPublishedProduct(slug) }
})

import { BlockPreviewPane } from './BlockPreviewPane'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BlockPreviewPane', () => {
  it('рисует обычные блоки как на витрине', () => {
    render(<BlockPreviewPane blocks={[{ type: 'paragraph', html: '<p>Текст абзаца</p>' }]} />)
    expect(screen.getByText('Текст абзаца')).toBeInTheDocument()
  })

  // Предпросмотр — клиентский компонент, а ProductGridBlock — async-серверный:
  // на клиенте он вечно висит на «Загрузка товаров...». Вместо него показываем
  // заметку со slug'ами; реальная подборка рендерится на витрине.
  it('вместо async-подборки товаров показывает заметку со slug и не ходит в API', () => {
    render(
      <BlockPreviewPane
        blocks={[
          { type: 'paragraph', html: '<p>До</p>' },
          {
            type: 'product_grid',
            productSlugs: ['nabor-yunogo-himika', 'vulkan-lavy'],
            heading: 'Что попробовать',
          },
          { type: 'paragraph', html: '<p>После</p>' },
        ]}
      />,
    )
    expect(screen.getByText(/Подборка товаров/)).toHaveTextContent(
      'nabor-yunogo-himika, vulkan-lavy',
    )
    expect(screen.getByText(/Подборка товаров/)).toHaveTextContent('Что попробовать')
    expect(screen.queryByText('Загрузка товаров...')).toBeNull()
    expect(getPublishedProduct).not.toHaveBeenCalled()
    // Порядок блоков сохранён.
    const text = screen.getByTestId('block-preview').textContent ?? ''
    expect(text.indexOf('До')).toBeLessThan(text.indexOf('Подборка товаров'))
    expect(text.indexOf('Подборка товаров')).toBeLessThan(text.indexOf('После'))
  })

  it('экранирует введённые slug и заголовок', () => {
    render(
      <BlockPreviewPane
        blocks={[{ type: 'product_grid', productSlugs: ['<b>x</b>'], heading: '<i>h</i>' }]}
      />,
    )
    const note = screen.getByText(/Подборка товаров/)
    expect(note.querySelector('b, i')).toBeNull()
    expect(note).toHaveTextContent('<b>x</b>')
  })

  it('пустой список блоков — подсказка', () => {
    render(<BlockPreviewPane blocks={[]} />)
    expect(screen.getByText('Добавьте блок, чтобы увидеть предпросмотр.')).toBeInTheDocument()
  })
})
