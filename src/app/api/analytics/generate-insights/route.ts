/**
 * Block 23870 — SmartSend Roofing Analytics AI Insights Generator
 * Generates roofer-friendly insights using AI
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!workspaceMember) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const workspaceId = workspaceMember.workspace_id

    // Get recent metrics
    const { data: dashboardMetrics } = await supabase
      .from('analytics_dashboard_metrics')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    // Get campaign performance
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, subject')
      .eq('workspace_id', workspaceId)

    // Get leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id, reply_intent, lead_score, email')
      .eq('workspace_id', workspaceId)

    const hotLeads = leads?.filter(l => 
      l.reply_intent?.toUpperCase() === 'HOT' || (l.lead_score || 0) >= 80
    ) || []

    // Generate insights based on data
    const insights: Array<{
      insight_type: string
      title: string
      message: string
      priority: string
      campaign_id?: string
      lead_id?: string
      metadata?: Record<string, any>
    }> = []

    // Insight 1: Hot leads waiting
    if (hotLeads.length > 0) {
      insights.push({
        insight_type: 'lead_alert',
        title: `${hotLeads.length} HOT LEADS waiting`,
        message: `You have ${hotLeads.length} hot leads that need immediate attention. These homeowners are ready to book — call them today!`,
        priority: 'urgent',
        metadata: { hotLeadsCount: hotLeads.length }
      })
    }

    // Insight 2: Campaign performance comparison
    if (campaigns && campaigns.length > 1) {
      // Calculate performance for each campaign
      const campaignPerformance: Array<{
        id: string
        name: string
        replyRate: number
      }> = []

      for (const campaign of campaigns) {
        const { data: emailEvents } = await supabase
          .from('email_events')
          .select('event_type')
          .eq('campaign_id', campaign.id)
          .gte('occurred_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

        if (!emailEvents || emailEvents.length === 0) continue

        const sent = emailEvents.filter(e => e.event_type === 'sent').length
        const replied = emailEvents.filter(e => e.event_type === 'reply').length
        const replyRate = sent > 0 ? (replied / sent) * 100 : 0

        campaignPerformance.push({
          id: campaign.id,
          name: campaign.name,
          replyRate
        })
      }

      if (campaignPerformance.length > 0) {
        campaignPerformance.sort((a, b) => b.replyRate - a.replyRate)
        const bestCampaign = campaignPerformance[0]
        const avgReplyRate = campaignPerformance.reduce((sum, c) => sum + c.replyRate, 0) / campaignPerformance.length

        if (bestCampaign.replyRate > avgReplyRate * 1.2) {
          insights.push({
            insight_type: 'performance_comparison',
            title: `Your "${bestCampaign.name}" campaign is outperforming others`,
            message: `Your "${bestCampaign.name}" campaign has a ${bestCampaign.replyRate.toFixed(1)}% reply rate, which is ${((bestCampaign.replyRate / avgReplyRate - 1) * 100).toFixed(0)}% higher than your average. Consider using this message for new campaigns.`,
            priority: 'medium',
            campaign_id: bestCampaign.id,
            metadata: { replyRate: bestCampaign.replyRate, avgReplyRate }
          })
        }
      }
    }

    // Insight 3: Growth opportunity
    if (dashboardMetrics) {
      const replyRate = dashboardMetrics.replies_received > 0 
        ? (dashboardMetrics.leads_created / dashboardMetrics.replies_received) * 100 
        : 0

      if (replyRate > 0 && replyRate < 20) {
        insights.push({
          insight_type: 'growth_opportunity',
          title: 'Adding more contacts could increase your results',
          message: `Based on your current ${replyRate.toFixed(1)}% conversion rate, adding 300 more contacts to your campaigns could increase replies by approximately ${Math.round(300 * replyRate / 100)}.`,
          priority: 'low',
          metadata: { currentConversionRate: replyRate, suggestedContacts: 300 }
        })
      }
    }

    // Insight 4: Open rate drop
    const { data: dailyMetrics } = await supabase
      .from('analytics_daily_metrics')
      .select('date, open_rate')
      .eq('workspace_id', workspaceId)
      .order('date', { ascending: false })
      .limit(14)

    if (dailyMetrics && dailyMetrics.length >= 7) {
      const recentAvg = dailyMetrics.slice(0, 7).reduce((sum, m) => sum + m.open_rate, 0) / 7
      const previousAvg = dailyMetrics.slice(7, 14).reduce((sum, m) => sum + m.open_rate, 0) / 7

      if (recentAvg < previousAvg * 0.8 && recentAvg < 15) {
        insights.push({
          insight_type: 'campaign_recommendation',
          title: 'Your open rate dropped — try a city-based subject line',
          message: `Your open rate decreased from ${previousAvg.toFixed(1)}% to ${recentAvg.toFixed(1)}%. Try personalizing subject lines with city names (e.g., "Roofing help in [City]") to improve engagement.`,
          priority: 'medium',
          metadata: { recentAvg, previousAvg }
        })
      }
    }

    // Save insights to database
    if (insights.length > 0) {
      const insightsToInsert = insights.map(insight => ({
        workspace_id: workspaceId,
        user_id: user.id,
        ...insight,
        expires_at: insight.insight_type === 'lead_alert' 
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Expire in 24h
          : null
      }))

      await supabase
        .from('analytics_insights')
        .insert(insightsToInsert)
    }

    return NextResponse.json({
      success: true,
      insightsGenerated: insights.length,
      insights
    })
  } catch (error) {
    console.error('Error generating insights:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}






































