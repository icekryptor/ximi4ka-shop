import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CtaBlock } from '@ximi4ka-shop/shared'
import { CtaBlockEditor } from './CtaBlockEditor'

describe('CtaBlockEditor', () => {
  const base: CtaBlock = {
    type: 'cta',
    heading: 'H',
    subtext: 'S',
    buttonLabel: 'L',
    buttonHref: '/go',
  }

  it('renders all fields with current values', () => {
    render(<CtaBlockEditor block={base} onChange={() => undefined} />)
    expect(screen.getByLabelText('Заголовок')).toHaveValue('H')
    expect(screen.getByLabelText('Подтекст')).toHaveValue('S')
    expect(screen.getByLabelText('Текст кнопки')).toHaveValue('L')
    expect(screen.getByLabelText('Ссылка кнопки')).toHaveValue('/go')
  })

  it('propagates heading / buttonLabel / buttonHref changes', () => {
    const onChange = vi.fn<(b: CtaBlock) => void>()
    render(<CtaBlockEditor block={base} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Заголовок'), {
      target: { value: 'New H' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ heading: 'New H' }),
    )

    fireEvent.change(screen.getByLabelText('Текст кнопки'), {
      target: { value: 'Buy' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ buttonLabel: 'Buy' }),
    )

    fireEvent.change(screen.getByLabelText('Ссылка кнопки'), {
      target: { value: '/shop' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ buttonHref: '/shop' }),
    )
  })

  it('empty subtext is coerced to null', () => {
    const onChange = vi.fn<(b: CtaBlock) => void>()
    render(<CtaBlockEditor block={base} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Подтекст'), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ subtext: null }),
    )
  })
})
