import 'server-only'
import { createAdminClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { monthWindow } from '@/lib/plan'
import { getPlanInfo } from '@/lib/plan'
export type UsageEvent = {
  userId: string;
  feature: string;
  tokens?: number;
  meta?: Record<string, unknown>;
};
export function getFreeDailyQuota(kind = 'default'): number {
  const envKey = `FREE_QUOTA_${String(kind || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_')`
  const perKind = process.env[envKey]
  const fallback = process.env.FREE_DAILY_QUOTA ?? process.env.NEXT_PUBLIC_FREE_DAILY_QUOTA
  
  // Set specific quotas for AI features
  if (kind === 'ai_optimization') {
    return Number(process.env.FREE_QUOTA_AI_OPTIMIZATION || 3)
  }
  if (kind === 'ai_scoring') {
    return Number(process.env.FREE_QUOTA_AI_SCORING || 10)
  }
  
  const n = Number(perKind ?? fallback ?? 5)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5
}
function todayRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}
export async function getUsageCountToday(userId: string, kind = 'default'): Promise<number> {
  const { start, end } = todayRange()
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('usage_events')
    .select('qty')
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', start)
    .lt('created_at', end)
    .limit(2000)
  if (error || !data) return 0
  return data.reduce((sum: number, row: any) => sum + (Number(row.qty) || 0), 0)
}
export async function recordUsage(userId: string, kind = 'default', qty = 1): Promise<void> {
  if (!userId) throw new Error('recordUsage: missing userId')
  const sb = createAdminClient()
  await sb.from('usage_events').insert({ user_id: userId, kind, qty })
}
export type SubscriptionStatus = 'free' | 'pro' | 'active' | 'cancelled' | 'past_due' | 'unpaid'
export type PlanInterval = 'month' | 'year' | null
export function isPro(status: SubscriptionStatus | null | undefined): boolean {
  return status === 'pro' || status === 'active'
}
export async function getUserSubscriptionStatus(): Promise<{ user: { id: string } | null; status: SubscriptionStatus | null, planInterval: PlanInterval }>{
  // We fetch using anon server client since we only need auth user id and a public column
  const { createServerComponentClient } = await import('@/lib/supabase')
  const supabase = createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, status: null, planInterval: null }
  const { data } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .maybeSingle()
  // Read plan interval from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_interval')
    .eq('id', user.id)
    .maybeSingle()
  const planInterval = ((profile as any)?.plan_interval as PlanInterval) ?? null
  return { user: { id: user.id }, status: (data?.subscription_status as SubscriptionStatus) ?? 'free', planInterval }
}
export async function requireQuota(userId: string, kind = 'default') {
  if (!userId) throw new Error('requireQuota: missing userId')
  
  const { user, status } = await getUserSubscriptionStatus()
  if (!user || user.id !== userId) throw new Error('unauthorized')
  
  const isUserPro = isPro(status)
  const limit = isUserPro ? (Number(process.env.PRO_DAILY_LIMIT || 500) || 500) : (Number(process.env.FREE_DAILY_LIMIT || getFreeDailyQuota(kind)) || 50)
  const used = await getUsageCountToday(userId, kind)
  
  if (used >= limit) {
    return { user, allowed: false as const, remaining: 0, quota: limit, used }
  }
  return { user, allowed: true as const, remaining: limit - used, quota: limit, used }
}
// Backward compatibility function - keep for existing code
export async function requireQuotaLegacy(kind = 'default') {
  const { user, status } = await getUserSubscriptionStatus()
  if (!user) throw new Error('unauthorized')
  
  const isUserPro = isPro(status)
  const limit = isUserPro ? (Number(process.env.PRO_DAILY_LIMIT || 500) || 500) : (Number(process.env.FREE_DAILY_LIMIT || getFreeDailyQuota(kind)) || 50)
  const used = await getUsageCountToday(user.id, kind)
  
  if (used >= limit) {
    return { user, allowed: false as const, remaining: 0, quota: limit, used }
  }
  return { user, allowed: true as const, remaining: limit - used, quota: limit, used }
}
// Function that matches what the routes expect - updated to use new interface
export async function recordUserUsage(evt: UsageEvent): Promise<void> {
  if (!evt?.userId) throw new Error('recordUserUsage: missing userId')
  // Map feature to kind for backward compatibility
  const kind = evt.feature || 'default'
  await recordUsage(evt.userId, kind, evt.tokens || 1)
}
// Monthly usage summary for email sends
export async function usageSummary() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' as const }
  // Get subscription_status from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single()
  const planInfo = getPlanInfo((profile as any)?.subscription_status)
  const { start, end } = monthWindow()
  // Count sends this month
  const { count } = await supabase
    .from('email_send_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
  const used = count || 0
  const resetsAt = end.toISOString()
  return {
    ok: true as const,
    plan: planInfo.plan,
    used,
    limit: planInfo.limit,
    remaining: Math.max(0, planInfo.limit - used),
    resetsAt,
  }
}
// Enforce monthly quota and log one send
export async function enforceQuotaAndLog(meta?: Record<string, any>) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' as const }

  const sum = await usageSummary()
  if (!sum.ok) return sum

  if (sum.used >= sum.limit) {
    return {
      ok: false as const,
      status: 402 as const,
      error: 'QuotaExceeded' as const,
      redirectTo: process.env.BILLING_PAGE || '/dashboard/billing',
      summary: sum,
    }
  }

  const { error } = await supabase.from('email_send_logs').insert({
    user_id: user.id,
    meta: meta || null,
  } as any)
  if (error) {
    return { ok: false as const, status: 500 as const, error: 'LogFailed' as const }
  }
  return { ok: true as const, status: 200 as const }
}
