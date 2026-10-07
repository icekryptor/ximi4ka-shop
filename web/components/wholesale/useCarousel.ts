import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'

/** Сдвиг меньше этого — касание или клик, а не жест. */
const SLOP_PX = 6
/** Протянули на столько и дальше — это свайп на следующую карточку. */
const SWIPE_MIN_PX = 40
/** Быстрый короткий жест (щелчок пальцем) тоже свайп, если он не короче этого. */
const FLICK_MIN_PX = 12
const FLICK_MAX_MS = 250
/** Через сколько вернуть scroll-snap, если `scrollend` не пришёл (Safari). */
const SNAP_RESTORE_MS = 700

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface Drag {
  pointerId: number
  startX: number
  startScroll: number
  startTime: number
  active: boolean
}

/**
 * Прокрутка дорожки по одной карточке. Дорожка сама прокручивается и
 * привязывается (CSS scroll-snap, колесо и клавиатурный фокус — нативные).
 * Поверх неё:
 * - края для отключения стрелок;
 * - `step` — шаг кнопок: `scrollBy` ширины одной карточки;
 * - свайп пальцем и мышью: карточка идёт за пальцем, а на отпускании
 *   уезжает ровно на одну (нативный жест при размашистом свайпе пролетает
 *   несколько). Горизонтальный жест забираем себе через `touch-action: pan-y`
 *   на дорожке, вертикальная прокрутка страницы остаётся нативной.
 */
export function useCarousel(track: HTMLUListElement | null) {
  const [edges, setEdges] = useState({ atStart: true, atEnd: false })
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef<RefObject<HTMLButtonElement | null> | null>(null)
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)

  const update = useCallback(() => {
    if (!track) return
    const atStart = track.scrollLeft <= 1
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1
    // Стрелка вот-вот отключится под фокусом — запоминаем, куда его отдать.
    const focused = document.activeElement
    if (atEnd && focused === nextRef.current) refocus.current = prevRef
    if (atStart && focused === prevRef.current) refocus.current = nextRef
    setEdges((cur) => (cur.atStart === atStart && cur.atEnd === atEnd ? cur : { atStart, atEnd }))
  }, [track])

  // Фокус на отключённой кнопке теряется — после перерисовки отдаём его парной.
  useEffect(() => {
    const target = refocus.current
    refocus.current = null
    target?.current?.focus()
  }, [edges])

  // Размер дорожки меняется при повороте и ресайзе — границы пересчитываем.
  useEffect(() => {
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(track)
    return () => observer.disconnect()
  }, [track, update])

  /** Шаг в пикселях: расстояние между началами соседних карточек (ширина и промежуток). */
  const cardWidth = useCallback((): number => {
    const first = track?.children[0] as HTMLElement | undefined
    if (!track || !first) return 0
    const second = track.children[1] as HTMLElement | undefined
    return second ? second.offsetLeft - first.offsetLeft : first.offsetWidth
  }, [track])

  const step = useCallback(
    (direction: 1 | -1) => {
      const width = cardWidth()
      if (!track || !width) return
      track.scrollBy({
        left: direction * width,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    },
    [track, cardWidth],
  )

  /** Конец жеста: уезжаем на карточку `direction` от той, с которой начали. */
  const settle = useCallback(
    (el: HTMLElement, from: number, direction: -1 | 0 | 1) => {
      const restoreSnap = () => {
        el.style.scrollSnapType = ''
      }
      const width = cardWidth()
      if (!width) return restoreSnap()
      const max = Math.max(0, el.scrollWidth - el.clientWidth)
      const target = Math.min(max, Math.max(0, (Math.round(from / width) + direction) * width))
      const smooth = !prefersReducedMotion()
      el.scrollBy({ left: target - el.scrollLeft, behavior: smooth ? 'smooth' : 'auto' })
      // Привязку возвращаем, когда доезжаем: иначе браузер дёрнет к ближайшей точке на полпути.
      if (smooth) {
        el.addEventListener('scrollend', restoreSnap, { once: true })
        setTimeout(restoreSnap, SNAP_RESTORE_MS)
      } else {
        restoreSnap()
      }
    },
    [cardWidth],
  )

  const onPointerDown = (e: PointerEvent) => {
    if (!track || (e.pointerType === 'mouse' && e.button !== 0)) return
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: track.scrollLeft,
      startTime: e.timeStamp,
      active: false,
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    const el = e.currentTarget as HTMLElement
    const dx = e.clientX - d.startX
    if (!d.active) {
      if (Math.abs(dx) < SLOP_PX) return
      d.active = true
      // На время жеста привязку выключаем: с ней scrollLeft не держит палец.
      el.style.scrollSnapType = 'none'
      el.setPointerCapture?.(e.pointerId)
    }
    el.scrollLeft = d.startScroll - dx
  }

  const finishDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    if (!d.active) return
    const dx = e.clientX - d.startX
    const quick = e.timeStamp - d.startTime <= FLICK_MAX_MS
    const swiped = Math.abs(dx) >= SWIPE_MIN_PX || (quick && Math.abs(dx) >= FLICK_MIN_PX)
    // Следом за отпусканием придёт click по карточке под пальцем — гасим его.
    suppressClick.current = true
    setTimeout(() => {
      suppressClick.current = false
    }, 0)
    settle(
      e.currentTarget as HTMLElement,
      d.startScroll,
      cancelled || !swiped ? 0 : dx < 0 ? 1 : -1,
    )
  }

  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return {
    ...edges,
    prevRef,
    nextRef,
    update,
    step,
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent) => finishDrag(e, false),
    onPointerCancel: (e: PointerEvent) => finishDrag(e, true),
    onClickCapture,
  }
}
