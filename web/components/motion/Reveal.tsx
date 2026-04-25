'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { EASE_OUT_QUART, REVEAL_DURATION, REVEAL_OFFSET } from '@/lib/motion'

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
    <motion.div
      initial={{ opacity: 0, y: REVEAL_OFFSET }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: REVEAL_DURATION, ease: EASE_OUT_QUART, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
