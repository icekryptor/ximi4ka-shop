import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageTabs, countFilled } from './LanguageTabs'

describe('LanguageTabs', () => {
  it('renders a tab for every supported locale', () => {
    render(<LanguageTabs active="ru" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /RU/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /EN/ })).toBeTruthy()
  })

  it('marks the active tab with aria-selected', () => {
    render(<LanguageTabs active="en" onChange={() => {}} />)
    const en = screen.getByRole('tab', { name: /EN/ })
    const ru = screen.getByRole('tab', { name: /RU/ })
    expect(en.getAttribute('aria-selected')).toBe('true')
    expect(ru.getAttribute('aria-selected')).toBe('false')
  })

  it('fires onChange with the clicked locale', () => {
    const onChange = vi.fn()
    render(<LanguageTabs active="ru" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /EN/ }))
    expect(onChange).toHaveBeenCalledWith('en')
  })

  it('shows ✓ for the default locale regardless of completeness input', () => {
    render(<LanguageTabs active="ru" onChange={() => {}} />)
    const ru = screen.getByRole('tab', { name: /RU/ })
    expect(ru.textContent ?? '').toContain('✓')
  })

  it('shows · for EN when no completeness reported', () => {
    render(<LanguageTabs active="ru" onChange={() => {}} />)
    const en = screen.getByRole('tab', { name: /EN/ })
    expect(en.textContent ?? '').toContain('·')
  })

  it('shows fractional completeness for partially filled EN', () => {
    render(
      <LanguageTabs
        active="ru"
        onChange={() => {}}
        completeness={{ en: { filled: 2, total: 3 } }}
      />,
    )
    const en = screen.getByRole('tab', { name: /EN/ })
    expect(en.textContent ?? '').toContain('2/3')
  })

  it('shows ✓ for EN when fully complete', () => {
    render(
      <LanguageTabs
        active="ru"
        onChange={() => {}}
        completeness={{ en: { filled: 3, total: 3 } }}
      />,
    )
    const en = screen.getByRole('tab', { name: /EN/ })
    expect(en.textContent ?? '').toContain('✓')
  })
})

describe('countFilled', () => {
  it('counts non-empty string and non-null values', () => {
    expect(countFilled(['a', 'b', null, '', '  ', undefined, 0])).toBe(3)
    // `0` is non-null so we count it; empty/whitespace strings don't.
  })
})
