import { loadSeedImageMap, rewriteTildaUrls } from '../../lib/tildaImages.js'
import { UPLOADS_DIR } from '../../lib/storage/index.js'

export interface ImageMapArgs {
  // --image-map <путь>: карта, скопированная с сервера (нужна, когда сид идёт
  // с машины разработчика, а перенесённые файлы лежат в томе на сервере).
  imageMap: string | null
  // --no-image-map: оставить ссылки на Tilda как в data-файле.
  noImageMap: boolean
}

// Подставляет в данные сида ссылки на уже перенесённые картинки
// (/uploads/tilda/…) вместо static.tildacdn.com. Сами api/data/*.json не
// меняются: функцию вызывают на копии, уходящей в БД. Нет карты — данные как есть.
export async function remapSeedImages<T>(
  data: T,
  args: ImageMapArgs,
  log: (info: { mapped: number; replaced: number }) => void,
): Promise<T> {
  const map = await loadSeedImageMap({
    uploadsDir: UPLOADS_DIR,
    explicitPath: args.imageMap,
    disabled: args.noImageMap,
  })
  if (map.size === 0) return data
  const out = rewriteTildaUrls(data, map)
  log({ mapped: map.size, replaced: out.replaced })
  return out.value
}
