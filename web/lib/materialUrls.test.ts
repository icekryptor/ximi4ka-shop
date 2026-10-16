import { describe, expect, it } from 'vitest'
import { accountMaterialDownloadUrl, orderMaterialDownloadUrl } from './materialUrls'

describe('materialUrls', () => {
  it('адрес скачивания со страницы заказа: номер, id и токен экранируются', () => {
    expect(orderMaterialDownloadUrl('XM-1', 'm 1', 't/k')).toMatch(
      /\/api\/public\/orders\/XM-1\/materials\/m%201\/download\?t=t%2Fk$/,
    )
  })

  it('адрес скачивания из кабинета', () => {
    expect(accountMaterialDownloadUrl('abc')).toMatch(/\/api\/account\/materials\/abc\/download$/)
  })
})
