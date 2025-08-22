import { describe, it, expect } from 'vitest'
import { getFreeDailyQuota } from '@/lib/usage'

describe('usage quotas', () => {
  it('falls back to NEXT_PUBLIC_FREE_DAILY_QUOTA when per-kind not present', () => {
    const q = getFreeDailyQuota('demo')
    expect(typeof q).toBe('number')
    expect(q).toBeGreaterThan(0)
  })
})
