import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getUserPlan, assertTeam } from '@/lib/plan'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gate: Team plan required for analytics export
    try {
      const plan = await getUserPlan(user.id)
      assertTeam(plan)
    } catch (error: any) {
      if (error.message === 'UPGRADE_REQUIRED') {
        return NextResponse.json(
          { error: 'Team plan required for analytics export. Please upgrade.' },
          { status: 402 }
        )
      }
      throw error
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const format = searchParams.get('format') || 'csv'

    // Get user's campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, title, user_id')
      .eq('user_id', user.id)

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    const campaignIds = campaigns?.map(c => c.id) || []

    if (campaignIds.length === 0) {
      return NextResponse.json({ error: 'No campaigns found' }, { status: 404 })
    }

    // Build query for events
    let eventsQuery = supabase
      .from('email_events')
      .select(`
        *,
        campaigns!inner(title, user_id)
      `)
      .in('campaign_id', campaignIds)

    if (startDate) {
      eventsQuery = eventsQuery.gte('created_at', startDate)
    }
    if (endDate) {
      eventsQuery = eventsQuery.lte('created_at', endDate)
    }

    const { data: events, error: eventsError } = await eventsQuery
      .order('created_at', { ascending: false })

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'Date',
        'Campaign',
        'Recipient',
        'Subject',
        'Event Type',
        'Email ID',
        'Metadata'
      ]

      const csvRows = events?.map(event => [
        new Date(event.created_at).toISOString(),
        event.campaigns?.title || '',
        event.recipient || '',
        event.subject || '',
        event.event_type,
        event.email_id || '',
        event.metadata ? JSON.stringify(event.metadata) : ''
      ]) || []

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => 
          row.map(field => 
            typeof field === 'string' && field.includes(',') 
              ? `"${field.replace(/"/g, '""')}"` 
              : field
          ).join(',')
        )
      ].join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }

    // Return JSON format
    return NextResponse.json({
      events: events?.map(event => ({
        date: event.created_at,
        campaign: event.campaigns?.title || '',
        recipient: event.recipient || '',
        subject: event.subject || '',
        event_type: event.event_type,
        email_id: event.email_id || '',
        metadata: event.metadata
      })) || [],
      total_events: events?.length || 0,
      date_range: {
        start: startDate,
        end: endDate
      }
    })

  } catch (error) {
    console.error('Export API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}