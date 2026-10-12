import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { DataSource } from 'typeorm'

// Три электронные методички, которые раньше планировались как публичные PDF:
// какой файл (в MATERIALS_DIR) каким товарам соответствует. Комбо «Химичка и
// Электрохимичка» и «Три набора» получают методички своих наборов;
// `vse-chetyre-nabora` пока нет в каталоге — слаг попадёт в отчёт как отсутствующий.
export interface MethodichkaSpec {
  fileKey: string
  title: string
  fileName: string
  slugs: string[]
}

export const METHODICHKI: MethodichkaSpec[] = [
  {
    fileKey: 'himichka.pdf',
    title: 'Методичка «Химичка 3.0 / Мини-Химичка»',
    fileName: 'himichka-metodichka.pdf',
    slugs: [
      'himichka-30',
      'mini-himichka',
      'himichka-metodichka',
      'himichka-i-elektrohimichka',
      'vse-tri-nabora',
      'vse-chetyre-nabora',
    ],
  },
  {
    fileKey: 'elektrohimichka.pdf',
    title: 'Методичка «Электрохимичка»',
    fileName: 'elektrometodichka.pdf',
    slugs: [
      'elektrohimichka',
      'elektrometodichka',
      'himichka-i-elektrohimichka',
      'vse-tri-nabora',
      'vse-chetyre-nabora',
    ],
  },
  {
    fileKey: 'oge-2026.pdf',
    title: 'Методичка «Химичка ОГЭ»',
    fileName: 'metodichka-oge-2026.pdf',
    slugs: ['bolshoi-nabor-dlya-oge', 'vse-chetyre-nabora'],
  },
]

export interface ApplyReport {
  /** Сколько материалов обработано (создано или обновлено). */
  materials: number
  /** Сколько новых связей «товар → материал» добавлено. */
  links: number
  missingFiles: string[]
  missingSlugs: string[]
  /** Сколько выдач добавлено уже оплаченным заказам. */
  backfilled: number
}

class DryRunRollback extends Error {}

async function fileSize(fullPath: string): Promise<number | null> {
  try {
    const info = await stat(fullPath)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

const UPSERT_SQL = `INSERT INTO learning_materials (title, kind, file_key, file_name, mime_type, size_bytes, is_active)
  VALUES ($1, 'file', $2, $3, 'application/pdf', $4, true)
  ON CONFLICT (file_key) WHERE file_key IS NOT NULL DO UPDATE
    SET title = EXCLUDED.title, file_name = EXCLUDED.file_name,
        size_bytes = EXCLUDED.size_bytes, updated_at = now()
  RETURNING id`

const BACKFILL_SQL = `INSERT INTO material_grants (material_id, order_id, customer_id, email, source)
  SELECT DISTINCT lmp.material_id, o.id, o.customer_id, NULLIF(lower(trim(o.customer_email)), ''), 'order'
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN learning_material_products lmp ON lmp.product_id = oi.product_id
  JOIN learning_materials lm ON lm.id = lmp.material_id AND lm.is_active AND lm.file_key = ANY($1)
  WHERE o.status IN ('paid', 'shipped')
  ON CONFLICT (order_id, material_id) WHERE order_id IS NOT NULL DO NOTHING
  RETURNING 1`

/**
 * Заводит методички из MATERIALS_DIR, привязывает к товарам и выдаёт
 * уже оплаченным заказам. Идемпотентна; всё в одной транзакции, dry-run её
 * откатывает, оставляя честный отчёт.
 */
export async function applyMethodichkiMaterials(
  ds: DataSource,
  opts: { dryRun: boolean; materialsDir: string },
): Promise<ApplyReport> {
  const report: ApplyReport = {
    materials: 0,
    links: 0,
    missingFiles: [],
    missingSlugs: [],
    backfilled: 0,
  }
  try {
    await ds.transaction(async (em) => {
      const fileKeys: string[] = []
      for (const spec of METHODICHKI) {
        const size = await fileSize(path.join(opts.materialsDir, spec.fileKey))
        if (size === null) {
          report.missingFiles.push(spec.fileKey)
          continue
        }
        const [{ id }]: { id: string }[] = await em.query(UPSERT_SQL, [
          spec.title,
          spec.fileKey,
          spec.fileName,
          size,
        ])
        report.materials += 1
        fileKeys.push(spec.fileKey)

        const products: { id: string; slug: string }[] = await em.query(
          'SELECT id, slug FROM products WHERE slug = ANY($1)',
          [spec.slugs],
        )
        const found = new Set(products.map((p) => p.slug))
        for (const slug of spec.slugs) {
          if (!found.has(slug) && !report.missingSlugs.includes(slug))
            report.missingSlugs.push(slug)
        }
        for (const p of products) {
          const inserted: unknown[] = await em.query(
            `INSERT INTO learning_material_products (material_id, product_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
            [id, p.id],
          )
          report.links += inserted.length
        }
      }
      if (fileKeys.length > 0) {
        const granted: unknown[] = await em.query(BACKFILL_SQL, [fileKeys])
        report.backfilled = granted.length
      }
      if (opts.dryRun) throw new DryRunRollback()
    })
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err
  }
  return report
}
