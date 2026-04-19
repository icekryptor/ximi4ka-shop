import pino from 'pino'
import { createApp } from './app.js'

const logger = pino()
const port = Number(process.env.PORT ?? 3001)

const app = createApp()
app.listen(port, () => {
  logger.info({ port }, 'api listening')
})
