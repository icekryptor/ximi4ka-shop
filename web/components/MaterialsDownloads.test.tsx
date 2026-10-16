import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MaterialsDownloads } from './MaterialsDownloads'

afterEach(cleanup)

const hrefFor = (id: string) => `/dl/${id}`

describe('<MaterialsDownloads>', () => {
  it('без материалов не рисует ничего', () => {
    const { container } = render(<MaterialsDownloads items={[]} hrefFor={hrefFor} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('файл — ссылка на скачивание через hrefFor, с заголовком по умолчанию', () => {
    render(
      <MaterialsDownloads
        items={[{ id: 'm1', title: 'Методичка «Химичка»', kind: 'file' }]}
        hrefFor={hrefFor}
      />,
    )
    expect(screen.getByTestId('materials')).toHaveTextContent('Ваши материалы')
    expect(screen.getByRole('link', { name: /Методичка «Химичка»/ })).toHaveAttribute(
      'href',
      '/dl/m1',
    )
  })

  it('внешняя ссылка ведёт на url и открывается в новой вкладке', () => {
    render(
      <MaterialsDownloads
        items={[{ id: 'm2', title: 'Видео', kind: 'link', url: 'https://example.com/v' }]}
        hrefFor={hrefFor}
      />,
    )
    const link = screen.getByRole('link', { name: /Видео/ })
    expect(link).toHaveAttribute('href', 'https://example.com/v')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('heading = null убирает заголовок', () => {
    render(
      <MaterialsDownloads
        items={[{ id: 'm1', title: 'Методичка', kind: 'file' }]}
        hrefFor={hrefFor}
        heading={null}
      />,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
