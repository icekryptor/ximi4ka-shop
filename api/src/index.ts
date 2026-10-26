import 'reflect-metadata'
import pino from 'pino'
import { createApp } from './app.js'
import { AppDataSource } from './config/dataSource.js'
import { startReconciliationJob } from './lib/payments/reconcile.js'
import { startNotificationWorker } from './lib/notifications/worker.js'
import { startCdekShipmentWorker } from './lib/cdek/worker.js'
import { startPickupPointsJob } from './lib/ycp/pickupPoints.js'
import { startMetrikaConversionWorker } from './lib/metrika/worker.js'
import { startLoginBotPolling } from './lib/telegram/loginPoller.js'
import { flagDefaultPasswordUsers } from './lib/auth/passwordMaintenance.js'
import { startWebVitalsRetentionJob } from './lib/analytics/retention.js'

const logger = pino()
const port = Number(process.env.PORT ?? 3001)

async function bootstrap() {
  await AppDataSource.initialize()
  logger.info('database connected')

  const app = createApp()
  app.listen(port, () => {
    logger.info({ port }, 'api listening')
  })

  // Polls Т-Касса (PAYMENT_PROVIDER=tbank) and Яндекс Пэй (YANDEX_PAY_MERCHANT_ID)
  // for pending orders whose webhook never arrived. No-op otherwise.
  if (startReconciliationJob()) {
    logger.info('payment reconciliation job started')
  }

  // Очередь уведомлений о заказах → Google Таблица и Telegram.
  // No-op, если ни один канал не настроен.
  if (startNotificationWorker()) {
    logger.info('order notifications worker started')
  }

  // Заказы в СДЭК после оплаты. No-op, пока CDEK_ORDERS_ENABLED не true.
  if (startCdekShipmentWorker()) {
    logger.info('cdek shipments worker started')
  }

  // Пункты выдачи СДЭК по всей России для YCP: снимок из базы, затем свежий
  // список и обновление раз в 12 часов. No-op без YCP_API_TOKEN.
  if (startPickupPointsJob()) {
    logger.info('ycp pickup points job started')
  }

  // Офлайн-конверсии оплаты в Яндекс.Метрику по yclid. No-op, пока
  // METRIKA_OFFLINE_ENABLED не true и не задан METRIKA_OAUTH_TOKEN.
  if (startMetrikaConversionWorker()) {
    logger.info('metrika offline conversions worker started')
  }

  // Полевые Web Vitals (web_vital) старше 90 дней удаляются раз в сутки.
  startWebVitalsRetentionJob()
  logger.info('web vitals retention job started')

  // Кто из пользователей админки ещё живёт с паролем по умолчанию из сида:
  // помечаем (баннер в админке) и пишем в лог. Не блокирует старт.
  flagDefaultPasswordUsers().catch((err) => {
    logger.error(err, 'проверка паролей по умолчанию не удалась')
  })

  // Бот входа в кабинет забирает update сам. No-op без TELEGRAM_LOGIN_POLLING=1.
  if (startLoginBotPolling()) {
    logger.info('telegram login bot polling started')
  }
}

bootstrap().catch((err) => {
  logger.error(err, 'bootstrap failed')
  process.exit(1)
})
