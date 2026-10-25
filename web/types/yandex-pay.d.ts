// Тег плашки Яндекс Пэй из Web SDK (pay.js). npm-пакета с типами у Яндекса нет —
// объявляем атрибуты, которые использует витрина (pay.yandex.ru/docs/ru/custom/web-sdk/badges).
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'yandex-pay-badge': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        type?: 'bnpl' | 'ultimate' | 'cashback'
        amount?: string
        'merchant-id'?: string
        source?: 'main' | 'listing' | 'item' | 'cart' | 'checkout' | 'other'
        size?: 's' | 'm' | 'l'
        theme?: 'light' | 'dark'
      }
    }
  }
}
