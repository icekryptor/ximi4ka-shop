import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BlogAuthorBox, type BlogAuthor } from './BlogAuthorBox'

afterEach(() => {
  cleanup()
})

function makeAuthor(overrides: Partial<BlogAuthor> = {}): BlogAuthor {
  return {
    authorName: 'Имя Фамилия',
    authorJobTitle: 'Должность',
    authorBio: 'Короткая справка об авторе.',
    authorUrl: 'https://example.com/profile',
    authorPhotoUrl: '/uploads/blog/author.jpg',
    ...overrides,
  }
}

describe('BlogAuthorBox', () => {
  it('рисует имя, должность, справку, фото и ссылку на профиль', () => {
    const { container } = render(<BlogAuthorBox post={makeAuthor()} />)
    expect(screen.getByRole('heading', { name: 'Имя Фамилия' })).toBeInTheDocument()
    expect(screen.getByText('Должность')).toBeInTheDocument()
    expect(screen.getByText('Короткая справка об авторе.')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('alt', 'Имя Фамилия')
    const link = screen.getByRole('link', { name: /профиль автора/i })
    expect(link).toHaveAttribute('href', 'https://example.com/profile')
    expect(link.getAttribute('rel')).toContain('author')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('подписан как «Об авторе»', () => {
    render(<BlogAuthorBox post={makeAuthor()} />)
    expect(screen.getByRole('region', { name: 'Об авторе' })).toBeInTheDocument()
  })

  it('без имени автора блока нет вовсе', () => {
    for (const authorName of [null, '', '   ']) {
      const { container } = render(<BlogAuthorBox post={makeAuthor({ authorName })} />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('необязательные поля не выводятся, если пусты', () => {
    const { container } = render(
      <BlogAuthorBox
        post={makeAuthor({
          authorJobTitle: null,
          authorBio: null,
          authorUrl: null,
          authorPhotoUrl: null,
        })}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Имя Фамилия' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('ссылка не на http(s) не превращается в href', () => {
    render(<BlogAuthorBox post={makeAuthor({ authorUrl: 'javascript:alert(1)' })} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
