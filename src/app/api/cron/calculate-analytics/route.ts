/**
 * Block 23870 — SmartSend Roofing Analytics Calculation Cron Job
 * Runs periodically to calculate and store dashboard metrics
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // Verify this is called from a cron job (add your secret verification)
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createRouteHandlerClient({ cookies })

    // Get all active workspaces
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')

    if (!workspaces) {
      return NextResponse.json({ success: true, message: 'No workspaces found' })
    }

    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1) // Start of month
    const periodEnd = now

    for (const workspace of workspaces) {
      await calculateWorkspaceMetrics(supabase, workspace.id, periodStart, periodEnd)
    }

    return NextResponse.json({ 
      success: true, 
      message: `Calculated metrics for ${workspaces.length} workspaces` 
    })
  } catch (error) {
    console.error('Error calculating analytics:', error)
    return NextResponse.json(
      { error: 'Failed to calculate analytics' },
      { status: 500 }
    )
  }
}

async function calculateWorkspaceMetrics(
  supabase: any,
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date
) {
  try {
    // Get workspace members to find user_id
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .single()

    if (!members) return

    const userId = members.user_id

    // Calculate replies received
    const { count: repliesCount } = await supabase
      .from('replies_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('received_at', periodStart.toISOString())

    // Calculate leads created (HOT/WARM)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, reply_intent, lead_score')
      .eq('workspace_id', workspaceId)
      .gte('created_at', periodStart.toISOString())

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

    // Calculate booked estimates
    const { count: bookedEstimatesCount } = await supabase
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['scheduled', 'completed'])
      .gte('created_at', periodStart.toISOString())

    const { count: appointmentsCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'completed'])
      .gte('created_at', periodStart.toISOString())

    const bookedEstimates = (bookedEstimatesCount || 0) + (appointmentsCount || 0)

    // Calculate estimated job value
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('average_ticket_price')
      .eq('user_id', userId)
      .single()

    const avgTicketPrice = userSettings?.average_ticket_price || 12000
    const estimatedJobValue = (hotLeads * avgTicketPrice) + (warmLeads * avgTicketPrice * 0.25)

    // Calculate campaign performance score
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('workspace_id', workspaceId)

    let totalOpenRate = 0
    let totalReplyRate = 0
    let campaignCount = 0

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

    // Upsert dashboard metrics
    await supabase
      .from('analytics_dashboard_metrics')
      .upsert({
        workspace_id: workspaceId,
        user_id: userId,
        replies_received: repliesCount || 0,
        leads_created: leadsCreated,
        booked_estimates: bookedEstimates,
        estimated_job_value: Math.round(estimatedJobValue),
        campaign_performance_score: campaignGrade,
        hot_leads_count: hotLeads,
        warm_leads_count: warmLeads,
        questions_count: questions,
        not_interested_count: notInterested,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        period_type: 'monthly',
        calculated_at: new Date().toISOString()
      }, {
        onConflict: 'workspace_id,period_start,period_end,period_type'
      })

    // Calculate daily metrics for the last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dayStart = new Date(date.setHours(0, 0, 0, 0))
      const dayEnd = new Date(date.setHours(23, 59, 59, 999))

      await calculateDailyMetrics(supabase, workspaceId, userId, dayStart, dayEnd)
    }
  } catch (error) {
    console.error(`Error calculating metrics for workspace ${workspaceId}:`, error)
  }
}

async function calculateDailyMetrics(
  supabase: any,
  workspaceId: string,
  userId: string,
  dayStart: Date,
  dayEnd: Date
) {
  try {
    const dateStr = dayStart.toISOString().split('T')[0]

    // Get email events for this day
    const { data: emailEvents } = await supabase
      .from('email_events')
      .select('event_type')
      .eq('user_id', userId)
      .gte('occurred_at', dayStart.toISOString())
      .lte('occurred_at', dayEnd.toISOString())

    const emailsSent = emailEvents?.filter(e => e.event_type === 'sent').length || 0
    const emailsOpened = emailEvents?.filter(e => e.event_type === 'open').length || 0
    const emailsReplied = emailEvents?.filter(e => e.event_type === 'reply').length || 0

    const openRate = emailsSent > 0 ? (emailsOpened / emailsSent) * 100 : 0
    const replyRate = emailsSent > 0 ? (emailsReplied / emailsSent) * 100 : 0

    // Get leads for this day
    const { data: leads } = await supabase
      .from('leads')
      .select('reply_intent, lead_score')
      .eq('workspace_id', workspaceId)
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', dayEnd.toISOString())

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

    // Get campaign activity
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, status, created_at')
      .eq('workspace_id', workspaceId)

    const campaignsActive = campaigns?.filter(c => c.status === 'active').length || 0
    const campaignsLaunched = campaigns?.filter(c => 
      new Date(c.created_at) >= dayStart && new Date(c.created_at) <= dayEnd
    ).length || 0

    // Upsert daily metrics
    await supabase
      .from('analytics_daily_metrics')
      .upsert({
        workspace_id: workspaceId,
        date: dateStr,
        emails_sent: emailsSent,
        emails_opened: emailsOpened,
        emails_replied: emailsReplied,
        open_rate: Math.round(openRate * 100) / 100,
        reply_rate: Math.round(replyRate * 100) / 100,
        hot_leads: hotLeads,
        warm_leads: warmLeads,
        questions: questions,
        not_interested: notInterested,
        campaigns_active: campaignsActive,
        campaigns_launched: campaignsLaunched,
        campaigns_paused: 0, // TODO: Track paused campaigns
        calculated_at: new Date().toISOString()
      }, {
        onConflict: 'workspace_id,date'
      })
  } catch (error) {
    console.error(`Error calculating daily metrics for ${dayStart.toISOString()}:`, error)
  }
}






































