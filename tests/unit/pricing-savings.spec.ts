import { describe, it, expect } from 'vitest'
import { computeAnnualSavings } from '../../src/lib/pricing'

describe('computeAnnualSavings', () => {
  it('computes percent and yearly diff', () => {
    const r = computeAnnualSavings(4900, 49000) // $49/mo vs $490/yr
    expect(r?.percent).toBe(16.7) // ≈ (49*12=588 → 490 => 16.7%)
    expect(r?.yearlyDiffCents).toBe(9800)
  })
  it('null when missing data', () => {
    expect(computeAnnualSavings(undefined, 1000)).toBeNull()
  })
})

