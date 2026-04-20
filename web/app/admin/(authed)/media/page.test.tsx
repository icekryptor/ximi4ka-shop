import { describe, it, expect } from 'vitest'
import AdminMediaPage from './page'

// Server component that fetches the first page of media via a cookie-forwarded
// server fetch. Keep the assertion narrow — it guards against accidentally
// regressing to a sync placeholder.
describe('Admin media page', () => {
  it('list page is an async server component', () => {
    expect(AdminMediaPage.constructor.name).toBe('AsyncFunction')
  })
})
