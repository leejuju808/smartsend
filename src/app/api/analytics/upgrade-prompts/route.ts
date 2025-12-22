/**
 * Block 23870 — SmartSend Roofing Analytics Upgrade Prompts API
 * Determines when to show upgrade prompts based on analytics
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's subscription
    const { data: subscription } = await supabase
      .from('workspace_subscriptions')
      .select('plan_id, status')
      .eq('workspace_id', (
        await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .single()
      ).data?.workspace_id)
      .single()

    const currentPlan = subscription?.plan_id || 'starter'

    // Get workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!workspaceMember) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const workspaceId = workspaceMember.workspace_id

    // Check for upgrade triggers
    const prompts: Array<{
      type: string
      currentPlan: string
      suggestedPlan: string
      message: string
      triggerMetric: string
      triggerValue: number
      priority: 'low' | 'medium' | 'high'
    }> = []

    // 1. Check email limit (Starter → Growth)
    if (currentPlan === 'starter') {
      const { count: emailsSent } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'sent')
        .gte('occurred_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

      // Starter plan: 500 emails/month limit
      if ((emailsSent || 0) >= 450) {
        prompts.push({
          type: 'starter_to_growth',
          currentPlan: 'starter',
          suggestedPlan: 'growth',
          message: 'You\'re approaching your email limit. Upgrade to Growth to send 2,000 emails/month and run 3 campaigns.',
          triggerMetric: 'emails_sent',
          triggerValue: emailsSent || 0,
          priority: 'high'
        })
      }
    }

    // 2. Check campaign limit (Starter → Growth)
    if (currentPlan === 'starter') {
      const { count: activeCampaigns } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')

      // Starter plan: 1 active campaign limit
      if ((activeCampaigns || 0) >= 1) {
        prompts.push({
          type: 'starter_to_growth',
          currentPlan: 'starter',
          suggestedPlan: 'growth',
          message: 'You\'ve reached your campaign limit. Upgrade to Growth to run 3 campaigns simultaneously.',
          triggerMetric: 'active_campaigns',
          triggerValue: activeCampaigns || 0,
          priority: 'medium'
        })
      }
    }

    // 3. High performance trigger (Starter → Growth)
    if (currentPlan === 'starter') {
      const { data: emailEvents } = await supabase
        .from('email_events')
        .select('event_type')
        .eq('user_id', user.id)
        .gte('occurred_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      if (emailEvents && emailEvents.length > 0) {
        const sent = emailEvents.filter(e => e.event_type === 'sent').length
        const opened = emailEvents.filter(e => e.event_type === 'open').length
        const replied = emailEvents.filter(e => e.event_type === 'reply').length

        const openRate = sent > 0 ? (opened / sent) * 100 : 0
        const replyRate = sent > 0 ? (replied / sent) * 100 : 0

        // High performance: >25% open rate and >4% reply rate
        if (openRate > 25 && replyRate > 4) {
          prompts.push({
            type: 'starter_to_growth',
            currentPlan: 'starter',
            suggestedPlan: 'growth',
            message: 'Your campaigns are performing great! Upgrade to Growth to scale with more campaigns and emails.',
            triggerMetric: 'performance_score',
            triggerValue: Math.round((openRate + replyRate * 10) / 2),
            priority: 'medium'
        })
        }
      }
    }

    // 4. Growth → Domination triggers
    if (currentPlan === 'growth') {
      const { count: activeCampaigns } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')

      // Growth plan: 3 active campaigns limit
      if ((activeCampaigns || 0) >= 2) {
        prompts.push({
          type: 'growth_to_domination',
          currentPlan: 'growth',
          suggestedPlan: 'domination',
          message: 'You\'re running multiple campaigns successfully. Upgrade to Domination for higher campaign limits and full storm automation.',
          triggerMetric: 'active_campaigns',
          triggerValue: activeCampaigns || 0,
          priority: 'medium'
        })
      }

      // Check reply volume
      const { count: repliesCount } = await supabase
        .from('replies_inbox')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('received_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      // High reply volume: >50 replies/month
      if ((repliesCount || 0) > 50) {
        prompts.push({
          type: 'growth_to_domination',
          currentPlan: 'growth',
          suggestedPlan: 'domination',
          message: 'You\'re getting great results! Upgrade to Domination for higher campaign limits and advanced automation.',
          triggerMetric: 'replies_received',
          triggerValue: repliesCount || 0,
          priority: 'high'
        })
      }
    }

    // Filter out prompts that were already dismissed
    const { data: dismissedPrompts } = await supabase
      .from('analytics_upgrade_prompts')
      .select('prompt_type')
      .eq('workspace_id', workspaceId)
      .eq('is_dismissed', true)

    const dismissedTypes = new Set(dismissedPrompts?.map(p => p.prompt_type) || [])
    const activePrompts = prompts.filter(p => !dismissedTypes.has(p.type))

    return NextResponse.json({
      success: true,
      prompts: activePrompts,
      currentPlan
    })
  } catch (error) {
    console.error('Error checking upgrade prompts:', error)
    return NextResponse.json(
      { error: 'Failed to check upgrade prompts' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await req.json()
    const { promptType, action } = body // action: 'dismiss' or 'upgrade'

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!workspaceMember) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const workspaceId = workspaceMember.workspace_id

    if (action === 'dismiss') {
      // Mark prompt as dismissed
      await supabase
        .from('analytics_upgrade_prompts')
        .upsert({
          workspace_id: workspaceId,
          user_id: user.id,
          prompt_type: promptType,
          is_dismissed: true,
          dismissed_at: new Date().toISOString()
        }, {
          onConflict: 'workspace_id,prompt_type'
        })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling upgrade prompt:', error)
    return NextResponse.json(
      { error: 'Failed to handle upgrade prompt' },
      { status: 500 }
    )
  }
}































