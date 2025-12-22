/**
 * Block 23870 — SmartSend Roofing Analytics Dashboard API
 * Core Dashboard Metrics Endpoint
 * Returns the 6 core metrics that roofers care about
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || 'all_time' // all_time, 7d, 30d, 90d

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
    let periodStart: Date
    let periodEnd = now

    switch (period) {
      case '7d':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        periodStart = new Date(0) // All time
    }

    // METRIC 1: Replies Received
    const { count: repliesCount } = await supabase
      .from('replies_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('received_at', periodStart.toISOString())

    // METRIC 2: Leads Created (HOT/WARM)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, status, reply_intent, lead_score')
      .eq('workspace_id', workspaceId)
      .gte('created_at', periodStart.toISOString())

    // Classify leads as HOT/WARM based on reply_intent or lead_score
    let hotLeads = 0
    let warmLeads = 0
    let questions = 0
    let notInterested = 0

    leads?.forEach(lead => {
      const intent = lead.reply_intent?.toUpperCase() || ''
      const score = lead.lead_score || 0

      if (intent === 'HOT' || score >= 80) {
        hotLeads++
      } else if (intent === 'WARM' || (score >= 60 && score < 80)) {
        warmLeads++
      } else if (intent === 'FOLLOW_UP' || intent === 'QUESTION') {
        questions++
      } else if (intent === 'NOT_INTERESTED' || intent === 'OUT_OF_SCOPE') {
        notInterested++
      }
    })

    const leadsCreated = hotLeads + warmLeads

    // METRIC 3: Booked Estimates
    const { count: bookedEstimatesCount } = await supabase
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['scheduled', 'completed'])
      .gte('created_at', periodStart.toISOString())

    // Also check appointments table
    const { count: appointmentsCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'completed'])
      .gte('created_at', periodStart.toISOString())

    const bookedEstimates = (bookedEstimatesCount || 0) + (appointmentsCount || 0)

    // METRIC 4: Estimated Job Value
    // Get average ticket price from user settings or use default $12,000
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('average_ticket_price')
      .eq('user_id', user.id)
      .single()

    const avgTicketPrice = userSettings?.average_ticket_price || 12000

    // Calculate estimated value
    // HOT leads: 100% probability
    // WARM leads: 25% probability
    const estimatedValue = (hotLeads * avgTicketPrice) + (warmLeads * avgTicketPrice * 0.25)

    // METRIC 5: Campaign Performance Score
    // Get all campaigns for this workspace
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('workspace_id', workspaceId)

    let totalOpenRate = 0
    let totalReplyRate = 0
    let campaignCount = 0

    for (const campaign of campaigns || []) {
      // Get email events for this campaign
      const { data: emailEvents } = await supabase
        .from('email_events')
        .select('event_type')
        .eq('campaign_id', campaign.id)
        .gte('occurred_at', periodStart.toISOString())

      if (!emailEvents || emailEvents.length === 0) continue

      const sent = emailEvents.filter(e => e.event_type === 'sent').length
      const opened = emailEvents.filter(e => e.event_type === 'open').length
      const replied = emailEvents.filter(e => e.event_type === 'reply').length

      if (sent > 0) {
        totalOpenRate += (opened / sent) * 100
        totalReplyRate += (replied / sent) * 100
        campaignCount++
      }
    }

    const avgOpenRate = campaignCount > 0 ? totalOpenRate / campaignCount : 0
    const avgReplyRate = campaignCount > 0 ? totalReplyRate / campaignCount : 0

    // Calculate grade
    let campaignGrade = 'D'
    if (avgOpenRate >= 30 && avgReplyRate >= 5) {
      campaignGrade = 'A'
    } else if (avgOpenRate >= 20 && avgReplyRate >= 3) {
      campaignGrade = 'B'
    } else if (avgOpenRate >= 10 && avgReplyRate >= 1) {
      campaignGrade = 'C'
    }

    // METRIC 6: Activity Timeline (recent activities)
    const { data: timelineEvents } = await supabase
      .from('lead_timeline_events')
      .select('event_type, event_subtype, message, created_at, metadata')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50)
      .gte('created_at', periodStart.toISOString())

    // Format timeline events
    const activityTimeline = (timelineEvents || []).map(event => ({
      type: event.event_type,
      subtype: event.event_subtype,
      message: event.message || getDefaultMessage(event.event_type, event.event_subtype),
      timestamp: event.created_at,
      metadata: event.metadata || {}
    }))

    return NextResponse.json({
      success: true,
      metrics: {
        repliesReceived: repliesCount || 0,
        leadsCreated,
        bookedEstimates,
        estimatedJobValue: Math.round(estimatedValue),
        campaignPerformanceScore: campaignGrade,
        activityTimeline: activityTimeline.slice(0, 20) // Last 20 activities
      },
      breakdown: {
        hotLeads,
        warmLeads,
        questions,
        notInterested
      },
      period: {
        type: period,
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      }
    })
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard metrics' },
      { status: 500 }
    )
  }
}

function getDefaultMessage(eventType: string, eventSubtype?: string | null): string {
  const messages: Record<string, string> = {
    'email_sent': 'Email sent',
    'reply_received': 'Reply received',
    'status_changed': 'Lead status updated',
    'campaign_launched': 'Campaign launched',
    'campaign_paused': 'Campaign paused',
    'lead_classified': 'Lead classified',
    'estimate_booked': 'Estimate booked'
  }

  return messages[eventType] || messages[eventSubtype || ''] || 'Activity recorded'
}
