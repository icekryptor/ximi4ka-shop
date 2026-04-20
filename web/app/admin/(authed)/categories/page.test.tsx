import { describe, it, expect } from 'vitest'
import AdminCategoriesPage from './page'
import EditCategoryPage from './[id]/page'
import NewCategoryPage from './new/page'

// Server components fetch with forwarded cookies and must stay async.
// The create page is a thin server wrapper (also async, because it fetches
// the flat category list for the parent selector).
describe('Admin category pages', () => {
  it('list page is an async server component', () => {
    expect(AdminCategoriesPage.constructor.name).toBe('AsyncFunction')
  })
  it('edit page is an async server component', () => {
    expect(EditCategoryPage.constructor.name).toBe('AsyncFunction')
  })
  it('new page is an async server component', () => {
    expect(NewCategoryPage.constructor.name).toBe('AsyncFunction')
  })
})
