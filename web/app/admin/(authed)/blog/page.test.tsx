import { describe, it, expect } from 'vitest'
import AdminBlogPage from './page'

// Server component smoke test — same shape as the pages admin suite. The
// list page runs on the server (cookies() + fetch), so it must stay async.
describe('Admin blog pages', () => {
  it('list page is an async server component', () => {
    expect(AdminBlogPage.constructor.name).toBe('AsyncFunction')
  })
})
