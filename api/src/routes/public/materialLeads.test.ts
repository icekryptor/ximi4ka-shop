import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { MaterialLead } from '../../entities/MaterialLead.js'
import { createApp } from '../../app.js'
import { errorHandler } from '../errors.js'
import { createMaterialLeadsRouter } from './materialLeads.js'
import { GoogleSheetsClient } from '../../lib/google/sheets.js'

const sendMessage = vi.hoisted(() => vi.fn<(html: string) => Promise<number>>())
const fromEnv = vi.hoisted(() => vi.fn())
vi.mock('../../lib/telegram/bot.js', () => ({
  TelegramBot: { fromEnv },
}))

const appendRowFrom = vi.hoisted(() => vi.fn())

const valid = {
  name: 'Мария',
  phone: '+7 (985) 993-83-11',
  telegram: 't.me/maria_chem',
  source: 'Нашел на ВБ',
  consent: true,
}

beforeAll(async () => {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize()
})

afterAll(async () => {
  if (AppDataSource.isInitialized) await AppDataSource.destroy()
})

beforeEach(async () => {
  await AppDataSource.query('TRUNCATE material_leads RESTART IDENTITY')
  sendMessage.mockReset()
  sendMessage.mockResolvedValue(1)
  fromEnv.mockReset()
  fromEnv.mockReturnValue({ sendMessage })
  appendRowFrom.mockReset()
  appendRowFrom.mockResolvedValue(undefined)
  vi.spyOn(GoogleSheetsClient, 'forMaterialsFromEnv').mockReturnValue({
    appendRowFrom,
  } as unknown as GoogleSheetsClient)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/public/material-leads', () => {
  it('saves the lead, normalizes the Telegram handle and answers 201', async () => {
    const res = await request(createApp()).post('/api/public/material-leads').send(valid)
    expect(res.status).toBe(201)
    expect(res.body.data.id).toEqual(expect.any(String))

    const rows = await AppDataSource.getRepository(MaterialLead).find()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'Мария',
      phone: '+7 (985) 993-83-11',
      telegram: '@maria_chem',
      source: 'Нашел на ВБ',
    })
  })

  it('works without a Telegram handle', async () => {
    const { telegram: _telegram, ...body } = valid
    const res = await request(createApp()).post('/api/public/material-leads').send(body)
    expect(res.status).toBe(201)
    const [row] = await AppDataSource.getRepository(MaterialLead).find()
    expect(row.telegram).toBeNull()
  })

  it('sends an escaped notification to the Telegram chat', async () => {
    await request(createApp())
      .post('/api/public/material-leads')
      .send({ ...valid, name: '<b>Мария</b> & Ко' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const html = sendMessage.mock.calls[0][0]
    expect(html).toContain('&lt;b&gt;Мария&lt;/b&gt; &amp; Ко')
    expect(html).toContain('@maria_chem')
    expect(html).toContain('Нашел на ВБ')
  })

  it('still answers 201 when Telegram fails', async () => {
    sendMessage.mockRejectedValue(new Error('boom'))
    const res = await request(createApp()).post('/api/public/material-leads').send(valid)
    expect(res.status).toBe(201)
    expect(await AppDataSource.getRepository(MaterialLead).count()).toBe(1)
  })

  it('appends the lead to the Google sheet from row 6256 and marks it synced', async () => {
    const res = await request(createApp()).post('/api/public/material-leads').send(valid)
    await vi.waitFor(() => expect(appendRowFrom).toHaveBeenCalledTimes(1))
    const [startRow, lastColumn, row] = appendRowFrom.mock.calls[0]
    expect(startRow).toBe(6256)
    expect(lastColumn).toBe('AG')
    expect(row.slice(0, 6)).toEqual([
      'Мария',
      '+7 (985) 993-83-11',
      '@maria_chem',
      'Нашел на ВБ',
      'https://ximi4ka.ru/get_materials',
      'form856589782',
    ])
    expect(row[7]).toBe(res.body.data.id)
    expect(row).toHaveLength(33)
    expect(row[32]).toBe('yes')
    await vi.waitFor(async () => {
      const [saved] = await AppDataSource.getRepository(MaterialLead).find()
      expect(saved.sheetSyncedAt).toBeInstanceOf(Date)
    })
  })

  it('keeps the lead unmarked when the sheet fails, and Telegram still goes out', async () => {
    appendRowFrom.mockRejectedValue(new Error('403'))
    const res = await request(createApp()).post('/api/public/material-leads').send(valid)
    expect(res.status).toBe(201)
    await vi.waitFor(() => expect(appendRowFrom).toHaveBeenCalled())
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [saved] = await AppDataSource.getRepository(MaterialLead).find()
    expect(saved.sheetSyncedAt).toBeNull()
  })

  it('still answers 201 when the bot is not configured', async () => {
    fromEnv.mockReturnValue(null)
    const res = await request(createApp()).post('/api/public/material-leads').send(valid)
    expect(res.status).toBe(201)
  })

  it.each([
    ['no consent', { consent: false }],
    ['missing consent', { consent: undefined }],
    ['empty name', { name: '  ' }],
    ['short phone', { phone: '12' }],
    ['bad telegram', { telegram: 'a b' }],
    ['newline in name', { name: 'Мария\nТелефон: 000' }],
    ['text instead of phone', { phone: 'http://evil.example' }],
    ['too few digits', { phone: '+7 (985)' }],
    ['unknown source', { source: 'Из космоса' }],
  ])('rejects %s with 400 and saves nothing', async (_label, patch) => {
    const res = await request(createApp())
      .post('/api/public/material-leads')
      .send({ ...valid, ...patch })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
    expect(await AppDataSource.getRepository(MaterialLead).count()).toBe(0)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('silently drops a submission with the honeypot filled', async () => {
    const res = await request(createApp())
      .post('/api/public/material-leads')
      .send({ ...valid, website: 'http://spam.example' })
    expect(res.status).toBe(201)
    expect(await AppDataSource.getRepository(MaterialLead).count()).toBe(0)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(appendRowFrom).not.toHaveBeenCalled()
  })

  it('accepts foreign phone numbers', async () => {
    const res = await request(createApp())
      .post('/api/public/material-leads')
      .send({ ...valid, phone: '+375 (29) 528-72-22' })
    expect(res.status).toBe(201)
  })

  it('stops notifying after the hourly budget but still saves the lead', async () => {
    const app = express()
      .use(express.json())
      .use(createMaterialLeadsRouter({ notifyPerHour: 1 }))
    app.use(errorHandler)
    for (let i = 0; i < 3; i++) await request(app).post('/').send(valid).expect(201)
    expect(await AppDataSource.getRepository(MaterialLead).count()).toBe(3)
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    expect(appendRowFrom).toHaveBeenCalledTimes(1)
  })

  it('rate-limits repeated submissions from one IP', async () => {
    const app = createApp()
    let last = 0
    for (let i = 0; i < 12; i++) {
      last = (await request(app).post('/api/public/material-leads').send(valid)).status
    }
    expect(last).toBe(429)
  })
})
