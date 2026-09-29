import { describe, it, expect } from 'vitest'
import { ssoClientLabel } from './ssoClient'

describe('ssoClientLabel', () => {
  it.each([
    ['/api/account/sso/authorize?client_id=learn&state=x', 'XimiLearn'],
    ['/api/account/sso/authorize?client_id=unknown', null],
    ['/api/account/sso/authorize?state=x', null],
    ['/account', null],
    ['/checkout?client_id=learn', null],
  ])('%s → %s', (next, expected) => {
    expect(ssoClientLabel(next)).toBe(expected)
  })
})
