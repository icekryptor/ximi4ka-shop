'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Children } from 'react'
import { EASE_OUT_QUART, REVEAL_DURATION, REVEAL_OFFSET } from '@/lib/motion'

interface Props {
  children: ReactNode
  staggerDelay?: number
  className?: string
}

export function Stagger({ children, staggerDelay = 0.08, className = '' }: Props) {
  const reduce = useReducedMotion()
  const childArray = Children.toArray(children)

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: staggerDelay },
        },
      }}
      className={className}
    >
      {childArray.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: REVEAL_OFFSET },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: REVEAL_DURATION, ease: EASE_OUT_QUART },
            },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
