import type { PublicTestimonial, PublicTrustStripItem } from '@/lib/api'

export const DEFAULT_TRUST_STRIP: PublicTrustStripItem[] = [
  { icon: '🚚', label: 'Доставка по России' },
  { icon: '🛡️', label: 'Безопасные реактивы' },
  { icon: '📚', label: 'Методические материалы' },
  { icon: '⭐', label: 'Более 1000 довольных семей' },
]

export const DEFAULT_TESTIMONIALS: PublicTestimonial[] = [
  {
    quote:
      'Сын в восторге от набора с кристаллами. Делаем эксперимент за экспериментом, я и сама втянулась.',
    author: 'Анна',
    location: 'Москва',
    rating: 5,
  },
  {
    quote:
      'Безопасно, понятно, интересно. Дочь (11 лет) делает эксперименты сама, я только подсказываю.',
    author: 'Михаил',
    location: 'Санкт-Петербург',
    rating: 5,
  },
  {
    quote:
      'Первый набор купили на день рождения, теперь покупаем регулярно. Дети уже спрашивают про химфак!',
    author: 'Елена',
    location: 'Казань',
    rating: 5,
  },
]
