'use client'

import { LazyMotion } from 'framer-motion'
import type { ReactNode } from 'react'

// Грузим фичи анимации лениво: до их загрузки `m.*`-элементы рендерятся как
// обычные узлы с начальными стилями (контент уже в HTML), после загрузки
// включаются whileInView/animate. `strict` ругается на `motion.*` внутри, чтобы
// полный framer-motion не вернулся в бандл случайно.
const loadFeatures = () => import('./features').then((res) => res.default)

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  )
}
