import 'reflect-metadata'
import pino from 'pino'
import { createApp } from './app.js'
import { AppDataSource } from './config/dataSource.js'

const logger = pino()
const port = Number(process.env.PORT ?? 3001)

async function bootstrap() {
  await AppDataSource.initialize()
  logger.info('database connected')

  const app = createApp()
  app.listen(port, () => {
    logger.info({ port }, 'api listening')
  })
}

bootstrap().catch((err) => {
  logger.error(err, 'bootstrap failed')
  process.exit(1)
})
