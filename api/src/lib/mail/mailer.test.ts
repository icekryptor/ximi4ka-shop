import { describe, it, expect, afterEach } from 'vitest'
import { MemoryMailer, getMailer, maskEmail, setMailerForTests } from './mailer.js'

describe('mailer', () => {
  afterEach(() => setMailerForTests(null))

  it('без SMTP вне прода — почта в памяти', () => {
    const m = getMailer({ NODE_ENV: 'development' })
    expect(m).toBeInstanceOf(MemoryMailer)
  })

  it('без SMTP в проде — почты нет', () => {
    expect(getMailer({ NODE_ENV: 'production' })).toBeNull()
  })

  it('с SMTP_HOST — SMTP-транспорт, не память', () => {
    const m = getMailer({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.ru',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'noreply@ximi4ka.ru',
      SMTP_PASS: 'x',
      MAIL_FROM: 'Химичка <noreply@ximi4ka.ru>',
    })
    expect(m).not.toBeNull()
    expect(m).not.toBeInstanceOf(MemoryMailer)
  })

  it('подмена для тестов важнее env', () => {
    const fake = new MemoryMailer()
    setMailerForTests(fake)
    expect(getMailer({ NODE_ENV: 'production' })).toBe(fake)
  })

  it('MemoryMailer находит последний код для адреса', async () => {
    const m = new MemoryMailer()
    await m.send({ to: 'a@b.ru', subject: 'x', text: 'Код для входа: 111111' })
    await m.send({ to: 'a@b.ru', subject: 'x', text: 'Код для входа: 222222' })
    expect(m.lastCodeFor('a@b.ru')).toBe('222222')
    expect(m.lastCodeFor('c@d.ru')).toBeNull()
  })

  it('маскирует email', () => {
    expect(maskEmail('ivan@mail.ru')).toBe('i***@mail.ru')
    expect(maskEmail('broken')).toBe('***')
  })
})
