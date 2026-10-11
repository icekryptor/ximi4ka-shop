// Заявка на обучающие материалы (страница /get_materials, QR-коды на наборах).
// Список «как узнали» — общий для формы витрины и проверки на api, поэтому
// живёт здесь; импортировать по подпути (как isBlock): shared не собирается в JS.
export const MATERIAL_LEAD_SOURCES = [
  'Получил в подарок',
  'От репетитора/учителя',
  'Нашел на ВБ',
  'Нашел на Озон',
  'Tiktok',
  'Instagram',
  'Youtube',
  'VK',
  'От друзей/знакомых',
  'Другое',
] as const

export type MaterialLeadSource = (typeof MATERIAL_LEAD_SOURCES)[number]

export interface MaterialLeadRequest {
  name: string
  phone: string
  /** Ник Telegram: «maria», «@maria» или «t.me/maria»; api хранит «@maria». */
  telegram?: string
  source: MaterialLeadSource
  /** Ловушка для ботов: всегда пустая у людей; если заполнена, api заявку не сохраняет. */
  website?: string
  /** Согласие с политикой конфиденциальности; без него api отвечает 400. */
  consent: true
}
