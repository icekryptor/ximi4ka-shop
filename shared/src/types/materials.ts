// Электронные материалы, которые покупатель получает за покупку: файл на
// закрытом томе сервера или внешняя ссылка. Путей к файлам в типах нет —
// скачивание идёт по id через API.

export type MaterialKind = 'file' | 'link'

/** Материал на странице заказа. `url` есть только у kind = 'link'. */
export interface PublicOrderMaterial {
  id: string
  title: string
  kind: MaterialKind
  url?: string
}

/** Материал в разделе кабинета «Мои материалы». */
export interface AccountMaterial {
  id: string
  title: string
  kind: MaterialKind
  /** Только у kind = 'link'. */
  url?: string
  fileName: string | null
  sizeBytes: number | null
  /** Когда материал выдан впервые (ISO). */
  grantedAt: string
}
