import { describe, it, expect } from 'vitest'
import AdminRedirectsPage from './page'
import EditRedirectPage from './[id]/page'
import NewRedirectPage from './new/page'

// Server components (list + edit) run on the server and call cookies()/fetch().
// A narrow smoke test ensures they stay async. "new" is a client component
// so it's a sync function — mirrors the pages/pages.test.tsx pattern.
describe('Admin redirects pages', () => {
  it('list page is an async server component', () => {
    expect(AdminRedirectsPage.constructor.name).toBe('AsyncFunction')
  })
  it('edit page is an async server component', () => {
    expect(EditRedirectPage.constructor.name).toBe('AsyncFunction')
  })
  it('new page is a function component', () => {
    expect(typeof NewRedirectPage).toBe('function')
  })
})
