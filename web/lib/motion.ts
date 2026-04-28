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

// === v2 additions ===

/** Springy overshoot — used for sticker entrances + button springs. */
export const EASE_BOUNCE = [0.34, 1.56, 0.64, 1] as const

/** Editorial smooth — used for count-up animations + page transitions. */
export const EASE_SMOOTH = [0.22, 1, 0.36, 1] as const

/** Heavy spring for cinematic hero text punch-in. */
export const SPRING_HEAVY = {
  type: 'spring' as const,
  stiffness: 180,
  damping: 24,
}

/** Full-cycle duration of the infinite-scroll Ticker marquee. */
export const TICKER_DURATION_S = 30
