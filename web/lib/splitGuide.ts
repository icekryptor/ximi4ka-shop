import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

// Страница «Как оплатить в Сплит». Условия — по официальным источникам Яндекса
// (Правила сервиса рассрочки от 15.09.2026, справка Сплита, документация Яндекс Пэй).
export const SPLIT_GUIDE_PATH = '/split'

export function splitGuidePath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? SPLIT_GUIDE_PATH : `/${locale}${SPLIT_GUIDE_PATH}`
}

export const SPLIT_RULES_URL = 'https://yandex.ru/legal/pravilarassrochki'
export const SPLIT_HELP_URL = 'https://yandex.ru/support/split/ru/'
