import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import AdminAccountPage from './page'

describe('/admin/account', () => {
  it('заголовок и форма смены пароля', () => {
    render(<AdminAccountPage />)

    expect(screen.getByRole('heading', { name: /смена пароля/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Текущий пароль')).toBeInTheDocument()
    expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument()
  })
})
