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

// === v3 — Лабораторный Журнал ===

/** CSS easing strings for use in `transition` / `animation` shorthand. */
export const EASE_OUT_QUART_CSS = 'cubic-bezier(0.25, 1, 0.5, 1)'
export const EASE_OUT_EXPO_CSS = 'cubic-bezier(0.19, 1, 0.22, 1)'

/** Hero formula ticker full loop, seconds. */
export const TICKER_DURATION_S_LJ = 50
/** Hero benzene wireframe rotation, seconds. */
export const ROTATE_SLOW_S = 80
/** Manifesto background ghost molecule rotation (reverse direction), seconds. */
export const ROTATE_GHOST_S = 200
/** Count-up animation total duration, milliseconds. */
export const COUNTUP_DURATION_MS = 1800
/** Stat-bar fill animation, seconds. */
export const STATBAR_DURATION_S = 1.2
