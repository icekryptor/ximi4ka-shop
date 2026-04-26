'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import type { Product } from '@ximi4ka-shop/shared'

interface Props {
  products: Product[]
}

const POSITIONS: Array<{
  top: string
  left?: string
  right?: string
  rotate: number
  size: string
}> = [
  { top: '0%', right: '0%', rotate: -8, size: '60%' },
  { top: '20%', left: '0%', rotate: 6, size: '55%' },
  { top: '50%', right: '10%', rotate: -3, size: '50%' },
]

export function HeroProductStack({ products }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  const { scrollY } = useScroll()
  // Parallax: products drift up at slightly different speeds
  const y0 = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -40])
  const y1 = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -70])
  const y2 = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -100])
  const ys = [y0, y1, y2]

  if (products.length === 0) {
    // Fallback: a single decorative card
    return (
      <div ref={ref} className="relative h-full w-full">
        <div className="absolute inset-x-8 inset-y-12 rounded-[var(--radius-lg)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)]" />
      </div>
    )
  }

  return (
    <div ref={ref} className="relative h-full w-full">
      {products.slice(0, 3).map((product, i) => {
        const pos = POSITIONS[i]
        return (
          <motion.div
            key={product.id}
            style={{
              position: 'absolute',
              top: pos.top,
              left: pos.left,
              right: pos.right,
              width: pos.size,
              y: ys[i],
              rotate: pos.rotate,
            }}
            className="aspect-square rounded-[var(--radius-lg)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] p-6 flex items-center justify-center text-center"
          >
            <div className="text-sm font-semibold text-[var(--color-brand-text)]">
              {product.name}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
