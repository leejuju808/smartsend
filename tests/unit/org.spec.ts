import { describe, it, expect } from 'vitest'
import { makeInviteToken } from '@/lib/org'

describe('org helpers', () => {
  it('makes a random invite token', () => {
    const a = makeInviteToken()
    const b = makeInviteToken()
    expect(a).not.toEqual(b)
    expect(a.length).toBeGreaterThan(20)
  })
})
