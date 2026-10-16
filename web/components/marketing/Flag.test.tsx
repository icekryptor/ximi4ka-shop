import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Flag } from './Flag'

describe('<Flag>', () => {
  it('рисует svg-флаг из /img/flags и прячет его от скринридеров (страна названа рядом)', () => {
    const { container } = render(<Flag code="kz" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/img/flags/kz.svg')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('width', '24')
    expect(img).toHaveAttribute('height', '18')
  })

  it('принимает дополнительный класс', () => {
    const { container } = render(<Flag code="ru" className="extra" />)
    expect(container.querySelector('img')).toHaveClass('extra')
  })
})
