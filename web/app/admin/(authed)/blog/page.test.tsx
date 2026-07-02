import { describe, it, expect } from 'vitest'
import AdminBlogPage from './page'
import EditBlogPostPage from './[id]/page'
import NewBlogPostPage from './new/page'

// Server components (list + edit) run on the server and call cookies()/
// fetch(). A narrow smoke test ensures they stay async. The "new" page is a
// client component so it's a sync function. Same shape as the pages suite.
describe('Admin blog pages', () => {
  it('list page is an async server component', () => {
    expect(AdminBlogPage.constructor.name).toBe('AsyncFunction')
  })
  it('edit page is an async server component', () => {
    expect(EditBlogPostPage.constructor.name).toBe('AsyncFunction')
  })
  it('new page is a function component', () => {
    expect(typeof NewBlogPostPage).toBe('function')
  })
})
