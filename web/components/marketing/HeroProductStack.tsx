'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import type { Product } from '@ximi4ka-shop/shared'
import { Sticker } from '@/components/ui'

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

type StickerBadge = {
  label: string
  variant: 'accent' | 'brand' | 'dark' | 'success'
  position: string // tailwind absolute positioning classes
  rotation: string // tailwind rotate utility
  wobble?: boolean
}

const BADGES: StickerBadge[][] = [
  [
    {
      label: 'Хит',
      variant: 'brand',
      position: '-top-3 -left-3',
      rotation: '-rotate-12',
      wobble: true,
    },
    {
      label: '−6%',
      variant: 'accent',
      position: '-bottom-3 -right-3',
      rotation: 'rotate-6',
    },
  ],
  [
    {
      label: '161 опыт',
      variant: 'accent',
      position: '-top-3 -right-3',
      rotation: 'rotate-12',
      wobble: true,
    },
    {
      label: 'Хит',
      variant: 'brand',
      position: '-bottom-3 -left-3',
      rotation: '-rotate-6',
    },
  ],
  [
    {
      label: 'От 10 лет',
      variant: 'brand',
      position: '-top-3 -left-3',
      rotation: '-rotate-6',
    },
    {
      label: 'Подарок',
      variant: 'accent',
      position: '-bottom-3 -right-3',
      rotation: 'rotate-12',
      wobble: true,
    },
  ],
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
        <div className="absolute inset-x-8 inset-y-12 rounded-[var(--radius-lg)] bg-[var(--color-dark-elevated)] shadow-[0_8px_60px_-8px_rgba(141,103,255,0.6)]" />
      </div>
    )
  }

  return (
    <div ref={ref} className="relative h-full w-full">
      {products.slice(0, 3).map((product, i) => {
        const pos = POSITIONS[i]
        const cardBadges = BADGES[i] ?? []
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
              boxShadow: '0 8px 60px -8px rgba(141,103,255,0.6)',
            }}
            className="aspect-square rounded-[var(--radius-lg)] bg-[var(--color-dark-elevated)] p-6 flex items-center justify-center text-center"
          >
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="text-sm font-semibold text-[var(--color-text-on-dark)]">
                {product.name}
              </div>
              {cardBadges.map((badge, j) => (
                <div
                  key={j}
                  className={`absolute ${badge.position} ${badge.rotation}`}
                >
                  <Sticker variant={badge.variant} wobble={badge.wobble}>
                    {badge.label}
                  </Sticker>
                </div>
              ))}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
