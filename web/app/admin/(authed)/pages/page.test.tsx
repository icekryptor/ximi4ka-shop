import { describe, it, expect } from 'vitest'
import AdminPagesPage from './page'
import EditPagePage from './[id]/page'
import NewPagePage from './new/page'

// Server components (list + edit) run on the server and call cookies()/
// fetch(). A narrow smoke test ensures they stay async. The "new" page is a
// client component so it's a sync function.
describe('Admin CMS pages', () => {
  it('list page is an async server component', () => {
    expect(AdminPagesPage.constructor.name).toBe('AsyncFunction')
  })
  it('edit page is an async server component', () => {
    expect(EditPagePage.constructor.name).toBe('AsyncFunction')
  })
  it('new page is a function component', () => {
    expect(typeof NewPagePage).toBe('function')
  })
})
