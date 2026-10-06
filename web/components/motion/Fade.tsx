'use client'

import { useReducedMotion } from 'framer-motion'
import * as m from 'framer-motion/m'
import type { ReactNode } from 'react'
import { EASE_OUT_QUART, REVEAL_DURATION } from '@/lib/motion'
import { MotionRoot } from './MotionRoot'

interface Props {
  children: ReactNode
  delay?: number
  className?: string
}

export function Fade({ children, delay = 0, className = '' }: Props) {
  const reduce = useReducedMotion()

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <MotionRoot>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: REVEAL_DURATION, ease: EASE_OUT_QUART, delay }}
        className={className}
      >
        {children}
      </m.div>
    </MotionRoot>
  )
}
