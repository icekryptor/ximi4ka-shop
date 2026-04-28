import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CharacteristicsCellRow } from './CharacteristicsCellRow'

describe('<CharacteristicsCellRow>', () => {
  it('renders one NumberCell per use-fact', () => {
    const facts = [
      { key: 'age' as const, label: 'возраст', big: '10+', bottomLeft: 'от 10 лет', bottomRight: 'рекомендуется' },
      { key: 'time' as const, label: 'время', big: '5–20', bottomLeft: 'минут', bottomRight: 'на один опыт' },
    ]
    const { container } = render(<CharacteristicsCellRow facts={facts} />)
    expect(container.querySelectorAll('.lj-num-cell').length).toBe(2)
  })

  it('renders nothing when facts array is empty', () => {
    const { container } = render(<CharacteristicsCellRow facts={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
