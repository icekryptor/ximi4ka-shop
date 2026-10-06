import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { motion } from 'framer-motion'
import { MotionRoot } from './MotionRoot'
import { Reveal } from './Reveal'
import { Fade } from './Fade'
import { Stagger } from './Stagger'

// Фичи framer-motion (LazyMotion) грузятся динамическим import() после
// гидрации. Контент при этом обязан быть в DOM и в серверном HTML сразу,
// а не только после загрузки фич.
describe('motion-компоненты до загрузки фич LazyMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Reveal: дети в DOM сразу после первого рендера', () => {
    render(
      <Reveal>
        <span>reveal-child</span>
      </Reveal>,
    )
    expect(screen.getByText('reveal-child')).toBeInTheDocument()
  })

  it('Fade: дети в DOM сразу после первого рендера', () => {
    render(
      <Fade>
        <span>fade-child</span>
      </Fade>,
    )
    expect(screen.getByText('fade-child')).toBeInTheDocument()
  })

  it('Stagger: все дети в DOM сразу после первого рендера', () => {
    render(
      <Stagger>
        <span>stagger-a</span>
        <span>stagger-b</span>
      </Stagger>,
    )
    expect(screen.getByText('stagger-a')).toBeInTheDocument()
    expect(screen.getByText('stagger-b')).toBeInTheDocument()
  })

  it('серверный HTML содержит контент и начальные стили (без скрытия через display/visibility)', () => {
    const html = renderToString(
      <>
        <Reveal className="r">
          <h2>seo-heading</h2>
        </Reveal>
        <Fade className="f">
          <p>seo-paragraph</p>
        </Fade>
      </>,
    )
    expect(html).toContain('seo-heading')
    expect(html).toContain('seo-paragraph')
    expect(html).toContain('opacity:0')
    expect(html).not.toContain('display:none')
    expect(html).not.toContain('visibility:hidden')
  })

  it('после загрузки фич контент остаётся, strict-режим не выбрасывает ошибок', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <>
        <Reveal>
          <span>after-reveal</span>
        </Reveal>
        <Fade>
          <span>after-fade</span>
        </Fade>
        <Stagger>
          <span>after-stagger</span>
        </Stagger>
      </>,
    )
    // дождаться резолва динамического import('./features')
    await waitFor(async () => {
      await import('./features')
    })
    expect(screen.getByText('after-reveal')).toBeInTheDocument()
    expect(screen.getByText('after-fade')).toBeInTheDocument()
    expect(screen.getByText('after-stagger')).toBeInTheDocument()
    expect(errors).not.toHaveBeenCalled()
  })

  it('MotionRoot работает в strict-режиме: полный motion.* внутри запрещён', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <MotionRoot>
          <motion.div>full-motion</motion.div>
        </MotionRoot>,
      ),
    ).toThrow()
  })
})
