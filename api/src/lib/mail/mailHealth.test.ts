import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getMailHealth,
  probeMailHealth,
  recordMailFailure,
  recordMailSuccess,
  resetMailHealthForTests,
  setMailerForTests,
  type Mailer,
} from './mailer.js'

describe('здоровье почты', () => {
  beforeEach(() => {
    resetMailHealthForTests()
    setMailerForTests(null)
  })

  it('по умолчанию здорова', () => {
    expect(getMailHealth().healthy).toBe(true)
  })

  it('ошибка входа в SMTP — нездорова, успех — снова здорова', () => {
    recordMailFailure(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))
    expect(getMailHealth()).toMatchObject({ healthy: false, lastError: 'Invalid login' })
    recordMailSuccess()
    expect(getMailHealth()).toMatchObject({ healthy: true, lastError: null })
  })

  it('отказ по адресу получателя здоровье не трогает', () => {
    recordMailFailure(Object.assign(new Error('550'), { code: 'EENVELOPE' }))
    expect(getMailHealth().healthy).toBe(true)
  })

  it('проверка соединения поднимает упавшую почту, когда SMTP ожил', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let alive = false
    const mailer: Mailer = {
      send: async () => {},
      verify: async () => {
        if (!alive) throw Object.assign(new Error('SMTP disabled'), { code: 'EAUTH' })
      },
    }
    setMailerForTests(mailer)
    await probeMailHealth()
    expect(getMailHealth().healthy).toBe(false)
    alive = true
    await probeMailHealth()
    expect(getMailHealth().healthy).toBe(true)
    errorSpy.mockRestore()
  })

  it('почта без verify (память, тесты) проверку проходит молча', async () => {
    setMailerForTests({ send: async () => {} })
    await probeMailHealth()
    expect(getMailHealth().healthy).toBe(true)
  })
})
