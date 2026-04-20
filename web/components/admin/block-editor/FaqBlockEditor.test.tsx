import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FaqBlock } from '@ximi4ka-shop/shared'
import { FaqBlockEditor } from './FaqBlockEditor'

describe('FaqBlockEditor', () => {
  it('adds a new item', () => {
    const onChange = vi.fn<(b: FaqBlock) => void>()
    render(
      <FaqBlockEditor
        block={{ type: 'faq', items: [{ question: 'Q', answer: 'A' }] }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /добавить вопрос/i }))
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)?.[0]
    expect(next?.items).toHaveLength(2)
    expect(next?.items[1]).toMatchObject({ question: '', answer: '' })
  })

  it('removes an item', () => {
    const onChange = vi.fn<(b: FaqBlock) => void>()
    render(
      <FaqBlockEditor
        block={{
          type: 'faq',
          items: [
            { question: 'Q1', answer: 'A1' },
            { question: 'Q2', answer: 'A2' },
          ],
        }}
        onChange={onChange}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: 'Удалить' })
    fireEvent.click(removeButtons[0])
    const next = onChange.mock.calls.at(-1)?.[0]
    expect(next?.items).toHaveLength(1)
    expect(next?.items[0].question).toBe('Q2')
  })

  it('updates question and answer', () => {
    const onChange = vi.fn<(b: FaqBlock) => void>()
    render(
      <FaqBlockEditor
        block={{ type: 'faq', items: [{ question: 'Q', answer: 'A' }] }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Вопрос'), {
      target: { value: 'New Q' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [{ question: 'New Q', answer: 'A' }],
      }),
    )
    fireEvent.change(screen.getByLabelText('Ответ'), {
      target: { value: 'New A' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [{ question: 'Q', answer: 'New A' }],
      }),
    )
  })
})
