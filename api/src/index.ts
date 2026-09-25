import 'reflect-metadata'
import pino from 'pino'
import { createApp } from './app.js'
import { AppDataSource } from './config/dataSource.js'
import { startReconciliationJob } from './lib/payments/reconcile.js'
import { startNotificationWorker } from './lib/notifications/worker.js'

const logger = pino()
const port = Number(process.env.PORT ?? 3001)

async function bootstrap() {
  await AppDataSource.initialize()
  logger.info('database connected')

  const app = createApp()
  app.listen(port, () => {
    logger.info({ port }, 'api listening')
  })

  // Polls Т-Касса for pending orders whose webhook never arrived.
  // No-op unless PAYMENT_PROVIDER=tbank.
  if (startReconciliationJob()) {
    logger.info('payment reconciliation job started (tbank)')
  }

  // Очередь уведомлений о заказах → Google Таблица и Telegram.
  // No-op, если ни один канал не настроен.
  if (startNotificationWorker()) {
    logger.info('order notifications worker started')
  }
}

bootstrap().catch((err) => {
  logger.error(err, 'bootstrap failed')
  process.exit(1)
})
