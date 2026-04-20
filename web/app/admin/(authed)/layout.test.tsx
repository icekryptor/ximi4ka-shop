import { describe, it, expect } from 'vitest'
import AuthedAdminLayout from './layout'

// The layout is a React Server Component that awaits fetchCurrentAdmin. Keep
// the assertion narrow: verifying it's declared async is enough to catch
// accidental `'use client'` regressions that would break the server-side
// session check.
describe('AuthedAdminLayout', () => {
  it('is an async Server Component', () => {
    expect(AuthedAdminLayout.constructor.name).toBe('AsyncFunction')
  })
})
