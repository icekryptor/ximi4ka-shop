import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { MATERIAL_LEAD_SOURCES } from '@ximi4ka-shop/shared/types/materialLead'
import { AppDataSource } from '../../config/dataSource.js'
import { MaterialLead } from '../../entities/MaterialLead.js'
import { appendMaterialLeadToSheet } from '../../lib/materialLeadSheet.js'
import { normalizeTelegramHandle } from '../../lib/telegramHandle.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Заявка на обучающие материалы со страницы /get_materials. Ссылки на сами
// материалы витрина показывает после отправки формы — api их не отдаёт.
const MaterialLeadSchema = z.object({
  // Без управляющих символов (переводов строк): иначе в карточку Telegram можно
  // подсунуть чужие «строки».
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[^\p{Cc}]+$/u),
  // Телефон как ввели («+7 (985) 993-83-11», «89859938311», зарубежные) — но только
  // цифры и знаки номера, не текст и не ссылки.
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+\d\s()-]+$/)
    .refine((v) => v.replace(/\D/g, '').length >= 10),
  telegram: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value, ctx) => {
      if (!value) return null
      const handle = normalizeTelegramHandle(value)
      if (!handle) {
        ctx.addIssue({ code: 'custom', message: 'Telegram: 5–32 латинских букв, цифр или _' })
        return z.NEVER
      }
      return handle
    }),
  source: z.enum(MATERIAL_LEAD_SOURCES),
  // Ловушка для ботов: людям поле не видно, боты заполняют всё подряд.
  website: z.string().max(200).optional(),
  consent: z.literal(true, { error: 'Нужно согласие с политикой конфиденциальности' }),
})

// Заявка уже в базе — сбой Google не должен её терять или пугать посетителя.
// В рабочий Telegram-чат заявки не идут (там заказы): они только в таблице.
async function syncLead(lead: MaterialLead): Promise<void> {
  await appendMaterialLeadToSheet(lead).catch((err: unknown) =>
    console.warn('material-leads: добавление в таблицу не ушло —', (err as Error).message),
  )
}

// Фабрика, а не константа: у каждого createApp() свои счётчики ограничителя,
// иначе тесты делили бы лимит друг с другом.
export function createMaterialLeadsRouter({
  notifyPerHour = 60,
}: { notifyPerHour?: number } = {}): Router {
  const router = Router()
  // Общий предел записей в таблицу на всех посетителей: поток поддельных заявок не должен
  // её завалить. Заявка сохраняется в базе в любом случае.
  let windowStart = 0
  let sent = 0
  const takeNotifySlot = (): boolean => {
    const now = Date.now()
    if (now - windowStart >= 60 * 60_000) {
      windowStart = now
      sent = 0
    }
    sent += 1
    return sent <= notifyPerHour
  }

  // POST /api/public/material-leads
  router.post('/', rateLimit({ limit: 10, windowMs: 10 * 60_000 }), async (req, res, next) => {
    try {
      const { consent: _consent, website, ...input } = MaterialLeadSchema.parse(req.body)
      if (website) {
        // Заполнена ловушка — это бот: отвечаем как обычно, но ничего не сохраняем.
        res.status(201).json({ data: { id: randomUUID() } })
        return
      }
      const repo = AppDataSource.getRepository(MaterialLead)
      const lead = await repo.save(repo.create(input))
      if (takeNotifySlot()) void syncLead(lead)
      else
        console.warn('material-leads: лимит записей в таблицу в час исчерпан, заявка только в базе')
      res.status(201).json({ data: { id: lead.id } })
    } catch (err) {
      next(err)
    }
  })

  return router
}
