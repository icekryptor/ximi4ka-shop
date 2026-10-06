'use client'

import { useReducedMotion } from 'framer-motion'
import * as m from 'framer-motion/m'
import type { ReactNode } from 'react'
import { EASE_OUT_QUART, REVEAL_DURATION, REVEAL_OFFSET } from '@/lib/motion'
import { MotionRoot } from './MotionRoot'

interface Props {
  children: ReactNode
  delay?: number
  className?: string
}

export function Reveal({ children, delay = 0, className = '' }: Props) {
  const reduce = useReducedMotion()

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <MotionRoot>
      <m.div
        initial={{ opacity: 0, y: REVEAL_OFFSET }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: REVEAL_DURATION, ease: EASE_OUT_QUART, delay }}
        className={className}
      >
        {children}
      </m.div>
    </MotionRoot>
  )
}
