/**
 * Block 23870 — SmartSend Roofing Analytics Insights API
 * Secondary Metrics & AI-Generated Insights
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '30d'

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

    // Calculate period dates
    const now = new Date()
    const days = period === '7d' ? 7 : 30
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    // 1. Open Rate Trend (7 days / 30 days)
    const { data: dailyMetrics } = await supabase
      .from('analytics_daily_metrics')
      .select('date, open_rate, reply_rate, emails_sent, emails_opened')
      .eq('workspace_id', workspaceId)
      .gte('date', periodStart.toISOString().split('T')[0])
      .order('date', { ascending: true })

    const openRateTrend = (dailyMetrics || []).map(metric => ({
      date: metric.date,
      openRate: metric.open_rate,
      replyRate: metric.reply_rate,
      emailsSent: metric.emails_sent,
      emailsOpened: metric.emails_opened
    }))

    // 2. Reply Type Breakdown
    const { data: leads } = await supabase
      .from('leads')
      .select('reply_intent, lead_score')
      .eq('workspace_id', workspaceId)
      .gte('created_at', periodStart.toISOString())

    let hotCount = 0
    let warmCount = 0
    let questionsCount = 0
    let notInterestedCount = 0

    leads?.forEach(lead => {
      const intent = lead.reply_intent?.toUpperCase() || ''
      const score = lead.lead_score || 0

      if (intent === 'HOT' || score >= 80) {
        hotCount++
      } else if (intent === 'WARM' || (score >= 60 && score < 80)) {
        warmCount++
      } else if (intent === 'FOLLOW_UP' || intent === 'QUESTION') {
        questionsCount++
      } else if (intent === 'NOT_INTERESTED' || intent === 'OUT_OF_SCOPE') {
        notInterestedCount++
      }
    })

    const replyTypeBreakdown = {
      hotLeads: hotCount,
      warmLeads: warmCount,
      questions: questionsCount,
      notInterested: notInterestedCount
    }

    // 3. Best Campaign of the Month
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, subject')
      .eq('workspace_id', workspaceId)
      .gte('created_at', periodStart.toISOString())

    let bestCampaign = null
    let bestReplyRate = 0

    for (const campaign of campaigns || []) {
      const { data: emailEvents } = await supabase
        .from('email_events')
        .select('event_type')
        .eq('campaign_id', campaign.id)
        .gte('occurred_at', periodStart.toISOString())

      if (!emailEvents || emailEvents.length === 0) continue

      const sent = emailEvents.filter(e => e.event_type === 'sent').length
      const replied = emailEvents.filter(e => e.event_type === 'reply').length
      const replyRate = sent > 0 ? (replied / sent) * 100 : 0

      if (replyRate > bestReplyRate) {
        bestReplyRate = replyRate
        bestCampaign = {
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          replyRate: Math.round(replyRate * 10) / 10
        }
      }
    }

    // 4. Underperforming Campaign Alerts
    const underperformingCampaigns: Array<{
      id: string
      name: string
      issue: string
      openRate: number
      replyRate: number
    }> = []

    for (const campaign of campaigns || []) {
      const { data: emailEvents } = await supabase
        .from('email_events')
        .select('event_type')
        .eq('campaign_id', campaign.id)
        .gte('occurred_at', periodStart.toISOString())

      if (!emailEvents || emailEvents.length === 0) continue

      const sent = emailEvents.filter(e => e.event_type === 'sent').length
      const opened = emailEvents.filter(e => e.event_type === 'open').length
      const replied = emailEvents.filter(e => e.event_type === 'reply').length

      const openRate = sent > 0 ? (opened / sent) * 100 : 0
      const replyRate = sent > 0 ? (replied / sent) * 100 : 0

      // Flag campaigns with low performance
      if (sent >= 50 && (openRate < 10 || replyRate < 1)) {
        let issue = ''
        if (openRate < 10 && replyRate < 1) {
          issue = 'Low open and reply rates — try a new subject line'
        } else if (openRate < 10) {
          issue = 'Low open rate — try a new subject line'
        } else if (replyRate < 1) {
          issue = 'Low reply rate — consider updating your message'
        }

        underperformingCampaigns.push({
          id: campaign.id,
          name: campaign.name,
          issue,
          openRate: Math.round(openRate * 10) / 10,
          replyRate: Math.round(replyRate * 10) / 10
        })
      }
    }

    // 5. Seasonal Opportunity Indicators (placeholder - would integrate with weather API)
    const seasonalOpportunities: Array<{
      type: string
      message: string
      priority: 'low' | 'medium' | 'high'
    }> = []

    // 5A. Seasonal truth (not guesses): compare month-over-month + year-over-year using rollups
    // NOTE: This is data-backed from timeline_events via mv_workspace_monthly_outreach.
    try {
      const { data: monthly } = await supabase
        .from('mv_workspace_monthly_outreach')
        .select('month, emails_sent, replies_received, reply_rate_pct')
        .eq('workspace_id', workspaceId)
        .order('month', { ascending: false })
        .limit(24)

      const rows = monthly || []
      const monthKey = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        return `${y}-${m}-01`
      }

      const currentKey = monthKey(now)
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevKey = monthKey(prevDate)
      const yoyDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      const yoyKey = monthKey(yoyDate)

      const current = rows.find(r => r.month === currentKey) ?? rows[0]
      const prev = rows.find(r => r.month === prevKey)
      const yoy = rows.find(r => r.month === yoyKey)

      // Only emit insights when we have meaningful volume (avoid noisy “truth”)
      if (current && (current.emails_sent ?? 0) >= 50) {
        if (prev && (prev.emails_sent ?? 0) >= 50) {
          const delta = (current.reply_rate_pct ?? 0) - (prev.reply_rate_pct ?? 0)
          if (Math.abs(delta) >= 1.0) {
            seasonalOpportunities.push({
              type: 'seasonality_mom',
              message: delta > 0
                ? `Reply rate is up ${Math.abs(delta).toFixed(1)}% vs last month — this is a good window to push more outreach.`
                : `Reply rate is down ${Math.abs(delta).toFixed(1)}% vs last month — consider tightening targeting or testing a new opener.`,
              priority: Math.abs(delta) >= 2.5 ? 'high' : 'medium'
            })
          }
        }

        if (yoy && (yoy.emails_sent ?? 0) >= 50) {
          const delta = (current.reply_rate_pct ?? 0) - (yoy.reply_rate_pct ?? 0)
          if (Math.abs(delta) >= 1.0) {
            seasonalOpportunities.push({
              type: 'seasonality_yoy',
              message: delta > 0
                ? `This month is performing ${Math.abs(delta).toFixed(1)}% better than the same month last year — your system is compounding.`
                : `This month is performing ${Math.abs(delta).toFixed(1)}% worse than the same month last year — adjust messaging before volume.`,
              priority: Math.abs(delta) >= 2.5 ? 'high' : 'medium'
            })
          }
        }
      }

      // “Best month” truth in the last 24 months (only if enough volume)
      const eligible = rows.filter(r => (r.emails_sent ?? 0) >= 100)
      if (eligible.length >= 3) {
        const best = eligible.reduce((a, b) => ((b.reply_rate_pct ?? 0) > (a.reply_rate_pct ?? 0) ? b : a), eligible[0])
        if (best?.month) {
          const label = new Date(best.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          seasonalOpportunities.push({
            type: 'best_seasonal_month',
            message: `Best reply month in your last 24 months was ${label} at ${Number(best.reply_rate_pct ?? 0).toFixed(1)}%. Plan volume around that window next cycle.`,
            priority: 'low'
          })
        }
      }
    } catch (e) {
      // Don't fail the insights response if rollups aren't available yet
      console.warn('Seasonal truth rollup unavailable:', e)
    }

    // 6. AI-Generated Insights
    const { data: insights } = await supabase
      .from('analytics_insights')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_dismissed', false)
      .or('expires_at.is.null,expires_at.gt.' + now.toISOString())
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      success: true,
      insights: {
        openRateTrend,
        replyTypeBreakdown,
        bestCampaign,
        underperformingCampaigns,
        seasonalOpportunities,
        aiInsights: insights || []
      },
      period: {
        type: period,
        start: periodStart.toISOString(),
        end: now.toISOString()
      }
    })
  } catch (error) {
    console.error('Error fetching insights:', error)
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    )
  }
}





































