import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Get analytics data for a specific campaign
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaignId = params.id
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const groupBy = searchParams.get('group_by') || 'day' // day, hour, week, month

    // Verify user owns this campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, title, user_id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get delivery count from send_queue or campaign_recipients
    const { data: deliveries, error: deliveryError } = await supabase
      .from('send_queue')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')

    if (deliveryError) {
      console.error('Error fetching deliveries:', deliveryError)
    }

    const totalDeliveries = deliveries?.length || 0

    // Build date filter for email_events
    let dateFilter = supabase
      .from('email_events')
      .select('*')
      .eq('campaign_id', campaignId)

    if (startDate) {
      dateFilter = dateFilter.gte('created_at', startDate)
    }
    if (endDate) {
      dateFilter = dateFilter.lte('created_at', endDate)
    }

    const { data: events, error: eventsError } = await dateFilter

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    // Aggregate data by time period
    const aggregated = aggregateEventsByTime(events || [], groupBy)

    // Calculate overall metrics
    const metrics = calculateMetrics(events || [], totalDeliveries)

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        title: campaign.title
      },
      metrics,
      timeline: aggregated,
      total_events: events?.length || 0
    })

  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to aggregate events by time period
function aggregateEventsByTime(events: any[], groupBy: string) {
  const groups = new Map<string, any>()

  events.forEach(event => {
    const date = new Date(event.created_at)
    let key: string

    switch (groupBy) {
      case 'hour':
        key = date.toISOString().slice(0, 13) + ':00:00Z'
        break
      case 'day':
        key = date.toISOString().slice(0, 10)
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        key = weekStart.toISOString().slice(0, 10)
        break
      case 'month':
        key = date.toISOString().slice(0, 7)
        break
      default:
        key = date.toISOString().slice(0, 10)
    }

    if (!groups.has(key)) {
      groups.set(key, {
        date: key,
        deliveries: 0,
        opens: 0,
        clicks: 0
      })
    }

    const group = groups.get(key)
    if (event.event === 'open') {
      group.opens++
    } else if (event.event === 'click') {
      group.clicks++
    }
  })

  return Array.from(groups.values()).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )
}

// Helper function to calculate overall metrics
function calculateMetrics(events: any[], totalDeliveries: number) {
  const metrics = {
    deliveries: totalDeliveries,
    opens: 0,
    clicks: 0,
    openRate: 0,
    ctr: 0, // Click-through rate (clicks/deliveries)
    uniqueOpens: new Set<string>(),
    uniqueClicks: new Set<string>()
  }

  events.forEach(event => {
    if (event.event === 'open') {
      metrics.opens++
      if (event.lead_id) {
        metrics.uniqueOpens.add(event.lead_id)
      }
    } else if (event.event === 'click') {
      metrics.clicks++
      if (event.lead_id) {
        metrics.uniqueClicks.add(event.lead_id)
      }
    }
  })

  // Calculate rates
  if (metrics.deliveries > 0) {
    metrics.openRate = Math.round((metrics.opens / metrics.deliveries) * 100 * 100) / 100
    metrics.ctr = Math.round((metrics.clicks / metrics.deliveries) * 100 * 100) / 100
  }

  return {
    ...metrics,
    uniqueOpens: metrics.uniqueOpens.size,
    uniqueClicks: metrics.uniqueClicks.size
  }
}