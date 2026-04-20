import { describe, it, expect } from 'vitest'
import AdminProductsPage from './page'
import EditProductPage from './[id]/page'
import NewProductPage from './new/page'

// Server components (list + edit) run on the server and call cookies()/
// fetch(). A narrow smoke test ensures they stay async so the layout's
// `cookies()` call isn't accidentally flipped into a client component.
// The "new" page is a client component (wraps state) so it's a sync fn.
describe('Admin product pages', () => {
  it('list page is an async server component', () => {
    expect(AdminProductsPage.constructor.name).toBe('AsyncFunction')
  })
  it('edit page is an async server component', () => {
    expect(EditProductPage.constructor.name).toBe('AsyncFunction')
  })
  it('new page is a function component', () => {
    expect(typeof NewProductPage).toBe('function')
  })
})
