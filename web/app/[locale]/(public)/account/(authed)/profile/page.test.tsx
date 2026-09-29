import { describe, it, expect, vi } from 'vitest'

const redirect = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ redirect }))

import AccountProfileRedirect from './page'

describe('/account/profile', () => {
  it('перенаправляет на единую страницу кабинета', () => {
    AccountProfileRedirect()
    expect(redirect).toHaveBeenCalledWith('/account')
  })
})
