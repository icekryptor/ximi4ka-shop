import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SupportButton } from './SupportButton'

describe('SupportButton', () => {
  it('ведёт в @ximi4ka_support в новой вкладке', () => {
    render(<SupportButton />)
    const link = screen.getByRole('link', { name: /Написать в поддержку/ })
    expect(link).toHaveAttribute('href', 'https://t.me/ximi4ka_support')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
