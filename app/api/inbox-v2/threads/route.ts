import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * GET /api/inbox-v2/threads
 * Get threads with filters and sorting
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const searchParams = req.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'all'
    const sort = searchParams.get('sort') || 'newest'
    const campaignId = searchParams.get('campaign_id')

    // Build query
    let query = supabase
      .from('inbox_threads')
      .select(`
        id,
        thread_key,
        subject,
        homeowner_name,
        last_message_snippet,
        last_message_at,
        unread_count,
        pipeline_stage_key,
        lead_heat_score,
        has_storm_damage,
        has_insurance_claim,
        has_appointment,
        has_quote,
        priority_color,
        contact_id,
        campaign_id,
        status,
        assigned_to,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)

    // Apply workspace filter
    // Note: Assuming inbox_threads has workspace_id or we join through contacts
    // Adjust based on your actual schema

    // Apply filters
    switch (filter) {
      case 'unread':
        query = query.gt('unread_count', 0)
        break
      case 'hot_leads':
        query = query.gte('lead_heat_score', 80)
        break
      case 'insurance':
        query = query.eq('has_insurance_claim', true)
        break
      case 'storm':
        query = query.eq('has_storm_damage', true)
        break
      case 'needs_reply':
        // Threads that need a reply (last message was inbound and unread)
        query = query.gt('unread_count', 0)
        break
      case 'waiting':
        // Threads waiting on homeowner response
        query = query.eq('status', 'open')
        break
      case 'booked':
        query = query.eq('has_appointment', true)
        break
    }

    // Apply campaign filter
    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    // Apply sorting
    switch (sort) {
      case 'hottest':
        query = query.order('lead_heat_score', { ascending: false, nullsLast: true })
        break
      case 'storm_affected':
        query = query.order('has_storm_damage', { ascending: false })
        break
      case 'insurance':
        query = query.order('has_insurance_claim', { ascending: false })
        break
      case 'unread':
        query = query.order('unread_count', { ascending: false })
        break
      case 'newest':
      default:
        query = query.order('last_message_at', { ascending: false })
        break
    }

    const { data: threads, error } = await query

    if (error) {
      console.error('Error fetching threads:', error)
      return NextResponse.json(
        { error: 'Failed to fetch threads', details: error.message },
        { status: 500 }
      )
    }

    // Transform threads
    const transformedThreads = (threads || []).map((thread: any) => ({
      id: thread.id,
      thread_key: thread.thread_key,
      subject: thread.subject,
      homeowner_name: thread.homeowner_name || 
        (thread.contacts ? `${thread.contacts.first_name || ''} ${thread.contacts.last_name || ''}`.trim() : null) ||
        thread.contacts?.email?.split('@')[0] ||
        'Unknown',
      last_message_snippet: thread.last_message_snippet,
      last_message_at: thread.last_message_at,
      unread_count: thread.unread_count || 0,
      pipeline_stage_key: thread.pipeline_stage_key,
      lead_heat_score: thread.lead_heat_score,
      has_storm_damage: thread.has_storm_damage || false,
      has_insurance_claim: thread.has_insurance_claim || false,
      has_appointment: thread.has_appointment || false,
      has_quote: thread.has_quote || false,
      priority_color: thread.priority_color || 'blue',
      contact_id: thread.contact_id,
      campaign_id: thread.campaign_id,
      status: thread.status || 'open',
      assigned_to: thread.assigned_to,
    }))

    return NextResponse.json({ threads: transformedThreads })
  } catch (error: any) {
    console.error('Error in GET /api/inbox-v2/threads:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































