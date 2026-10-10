import { AppDataSource } from '../config/dataSource.js'
import { MaterialLead } from '../entities/MaterialLead.js'
import { GoogleSheetsClient } from './google/sheets.js'

// Заявки со страницы /get_materials дописываются в ту же таблицу «Покупатели
// набора», куда раньше их складывала Tilda: колонки A–H и AG, как у старых
// строк (header: name, Phone, Input, source, referer, formid, sent, requestid …
// Checkbox). С какой строки продолжать — решил владелец: 6256.
const DEFAULT_START_ROW = 6256
const LAST_COLUMN = 'AG'
const REFERER = 'https://ximi4ka.ru/get_materials'
// formid формы Tilda: по нему таблицу фильтруют, оставляем прежним.
const FORM_ID = 'form856589782'
// Колонки I–AF у заявок пустые (там данные корзины Tilda).
const GAP_COLUMNS = 24

// «2026-10-09 17:48:27» по Москве — так писала Tilda, таблица отсортирована по этому полю.
export function sheetTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}

export function materialLeadSheetRow(lead: MaterialLead): string[] {
  return [
    lead.name,
    lead.phone,
    lead.telegram ?? '',
    lead.source,
    REFERER,
    FORM_ID,
    sheetTimestamp(lead.createdAt),
    lead.id,
    ...Array<string>(GAP_COLUMNS).fill(''),
    'yes',
  ]
}

function startRow(env: NodeJS.ProcessEnv): number {
  const n = Number(env.MATERIALS_SHEETS_START_ROW)
  return Number.isInteger(n) && n > 1 ? n : DEFAULT_START_ROW
}

// Дописывает заявку в таблицу и ставит отметку в базе. Таблица не настроена —
// молча пропускает (локальная разработка). Ошибка летит наружу: заявка в базе
// остаётся без отметки sheet_synced_at, по ней видно, что дописать вручную.
export async function appendMaterialLeadToSheet(
  lead: MaterialLead,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const sheets = GoogleSheetsClient.forMaterialsFromEnv(env)
  if (!sheets) return
  await sheets.appendRowFrom(startRow(env), LAST_COLUMN, materialLeadSheetRow(lead))
  await AppDataSource.getRepository(MaterialLead).update(lead.id, { sheetSyncedAt: new Date() })
}
