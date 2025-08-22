import 'server-only'
import { stripe } from '@/lib/stripe'

const CACHE_TTL_MS = 5 * 60 * 1000

export type PriceInfo = {
  id: string
  unitAmount: number | null
  currency: string | null
  nickname?: string | null
  interval?: 'day' | 'week' | 'month' | 'year' | null
}

type Term = 'monthly' | 'annual'

function pickMonthlyId(): string {
  const variant = (process.env.NEXT_PUBLIC_PRICE_VARIANT || '').toLowerCase()
  const founders = process.env.STRIPE_PRICE_PRO_FOUNDERS
  const standard = process.env.STRIPE_PRICE_PRO_STANDARD
  const fallback = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
  const chosen =
    (variant === 'founders' && founders) ? founders :
    (variant === 'standard' && standard) ? standard :
    fallback
  if (!chosen) {
    throw new Error('Missing monthly price id: set STRIPE_PRICE_PRO_FOUNDERS/STRIPE_PRICE_PRO_STANDARD or NEXT_PUBLIC_STRIPE_PRICE_ID')
  }
  return chosen
}

function pickAnnualId(): string | null {
  const variant = (process.env.NEXT_PUBLIC_PRICE_VARIANT || '').toLowerCase()
  const founders = process.env.STRIPE_PRICE_PRO_ANNUAL_FOUNDERS
  const standard = process.env.STRIPE_PRICE_PRO_ANNUAL_STANDARD
  const generic = process.env.STRIPE_PRICE_PRO_ANNUAL
  return (variant === 'founders' && founders)
    || (variant === 'standard' && standard)
    || generic
    || null
}

export function getActivePriceId(term: Term = 'monthly'): string {
  if (term === 'annual') {
    const a = pickAnnualId()
    if (a) return a
    // fall back to monthly if annual not configured
  }
  return pickMonthlyId()
}

let cache: Record<string, { ts: number, info: PriceInfo }> = {}
async function fetchPriceInfo(id: string): Promise<PriceInfo> {
  const now = Date.now()
  const hit = cache[id]
  if (hit && hit.ts + CACHE_TTL_MS > now) return hit.info
  const price = await stripe.prices.retrieve(id)
  const info: PriceInfo = {
    id,
    unitAmount: price.unit_amount ?? null,
    currency: (price as any).currency ?? null,
    nickname: (price as any).nickname ?? null,
    interval: (price as any).recurring?.interval ?? null,
  }
  cache[id] = { ts: now, info }
  return info
}

export async function getActivePriceInfo(term: Term = 'monthly'): Promise<PriceInfo> {
  const id = getActivePriceId(term)
  return fetchPriceInfo(id)
}

export async function getActivePriceInfos(): Promise<{ monthly: PriceInfo, annual?: PriceInfo }> {
  const monthlyId = getActivePriceId('monthly')
  const annualId = pickAnnualId()
  const monthly = await fetchPriceInfo(monthlyId)
  const annual = annualId ? await fetchPriceInfo(annualId) : undefined
  return { monthly, annual }
}

export function computeAnnualSavings(monthlyCents?: number | null, annualCents?: number | null) {
  if (!monthlyCents || !annualCents) return null
  const perMonthAnnualCents = Math.round(annualCents / 12)
  const pct = Math.max(0, 1 - perMonthAnnualCents / monthlyCents) * 100
  const pctRounded = Math.round(pct * 10) / 10
  const yearlyDiffCents = monthlyCents * 12 - annualCents
  return { perMonthAnnualCents, yearlyDiffCents, percent: pctRounded }
}
