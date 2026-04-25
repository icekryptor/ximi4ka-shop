export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const

export const EASE_SPRING_SOFT = {
  type: 'spring' as const,
  stiffness: 240,
  damping: 28,
}

export const EASE_SPRING_PUNCHY = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 22,
}

export const REVEAL_DURATION = 0.5
export const REVEAL_OFFSET = 16
