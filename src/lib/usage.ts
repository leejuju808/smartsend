import { createClientComponentClient } from '@/lib/supabase'
import { getUsageLimits, canUseFeature, getUpgradeMessage } from './subscription'

export interface UsageRecord {
  userId: string
  feature: string
  tokens?: number
  metadata?: Record<string, any>
  timestamp: Date
}

export interface QuotaCheck {
  allowed: boolean
  used: number
  remaining: number
  quota: number
  message?: string
}

/**
 * Check if user can use a specific feature based on their plan
 */
export async function checkFeatureAccess(
  userId: string, 
  feature: string
): Promise<QuotaCheck> {
  const usage = await getUsageLimits(userId)
  if (!usage) {
    return {
      allowed: false,
      used: 0,
      remaining: 0,
      quota: 0,
      message: 'Unable to verify subscription status'
    }
  }

  const featureKey = getFeatureKey(feature)
  if (!featureKey) {
    return {
      allowed: true, // Unknown features are allowed
      used: 0,
      remaining: -1,
      quota: -1
    }
  }

  const canUse = canUseFeature(usage, featureKey)
  const limit = usage[featureKey]

  return {
    allowed: canUse,
    used: limit.used,
    remaining: limit.remaining,
    quota: limit.limit,
    message: canUse ? undefined : getUpgradeMessage(feature, 'free')
  }
}

/**
 * Record usage of a feature for analytics and billing
 */
export async function recordUsage(
  userId: string,
  feature: string,
  tokens?: number,
  metadata?: Record<string, any>
): Promise<void> {
  const supabase = createClientComponentClient()
  
  // Record the usage event
  await supabase.from('usage_events').insert({
    user_id: userId,
    feature,
    tokens: tokens || 1,
    metadata: metadata || {},
    created_at: new Date().toISOString()
  })

  // Update monthly sends if this is an email send
  if (feature === 'email_send') {
    await supabase.rpc('increment_monthly_sends', { user_id: userId })
  }

  // Update AI usage if this is an AI feature
  if (feature.startsWith('ai_')) {
    await supabase.from('ai_usage').upsert({
      user_id: userId,
      feature,
      usage_count: 1,
      last_used: new Date().toISOString()
    }, { onConflict: 'user_id,feature' })
  }
}

/**
 * Enforce quota before allowing feature usage
 */
export async function requireQuota(
  userId: string,
  feature: string
): Promise<QuotaCheck> {
  const quota = await checkFeatureAccess(userId, feature)
  
  if (!quota.allowed) {
    throw new Error(`Quota exceeded for ${feature}: ${quota.message}`)
  }

  return quota
}

/**
 * Get feature key from feature string
 */
function getFeatureKey(feature: string): keyof import('./subscription').UsageLimits | null {
  const featureMap: Record<string, keyof import('./subscription').UsageLimits> = {
    'campaign_create': 'campaigns',
    'template_create': 'templates',
    'contact_import': 'contacts',
    'sequence_create': 'sequences',
    'ai_optimization': 'aiOptimizations',
    'ai_generation': 'aiOptimizations',
    'integration_connect': 'integrations',
    'email_send': 'monthlySends'
  }

  return featureMap[feature] || null
}

/**
 * Get comprehensive usage analytics for a user
 */
export async function getUserUsageAnalytics(
  userId: string,
  timeframe: 'day' | 'week' | 'month' = 'month'
): Promise<{
  totalUsage: number
  featureBreakdown: Record<string, number>
  costEstimate: number
  trend: 'increasing' | 'decreasing' | 'stable'
}> {
  const supabase = createClientComponentClient()
  
  const now = new Date()
  let startDate: Date
  
  switch (timeframe) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
  }

  const { data: usageEvents } = await supabase
    .from('usage_events')
    .select('feature, tokens, created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', now.toISOString())

  const featureBreakdown: Record<string, number> = {}
  let totalUsage = 0

  usageEvents?.forEach(event => {
    const tokens = event.tokens || 1
    featureBreakdown[event.feature] = (featureBreakdown[event.feature] || 0) + tokens
    totalUsage += tokens
  })

  // Simple cost estimation (can be enhanced with actual pricing)
  const costEstimate = totalUsage * 0.001 // $0.001 per token/usage

  // Calculate trend (simplified)
  const trend: 'increasing' | 'decreasing' | 'stable' = 'stable'

  return {
    totalUsage,
    featureBreakdown,
    costEstimate,
    trend
  }
}

/**
 * Reset usage counters (called monthly via cron)
 */
export async function resetMonthlyUsage(): Promise<void> {
  const supabase = createClientComponentClient()
  
  await supabase.rpc('reset_monthly_sends')
  
  // Reset other monthly counters
  await supabase
    .from('profiles')
    .update({ 
      monthly_sends: 0,
      last_reset: new Date().toISOString()
    })
    .lt('last_reset', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
}
