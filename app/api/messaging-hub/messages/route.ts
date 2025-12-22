import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * GET /api/messaging-hub/messages
 * Get unified messages with enhanced filtering
 * 
 * Filters:
 * - all: All messages
 * - homeowners: Messages from homeowners
 * - leads: Messages from leads (not yet converted to jobs)
 * - insurance: Messages related to insurance
 * - suppliers: Messages from suppliers
 * - crews: Messages from crew members
 * - high_priority: High priority messages
 * - needs_follow_up: Messages that need follow-up
 * - hot_leads: Hot lead messages
 * - scheduled_jobs: Messages from scheduled jobs
 * - completed_jobs: Messages from completed jobs
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id, user } = gate
    const user_id = user.id
    const supabase = getServerSupabase()

    const searchParams = req.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'all'
    const channel = searchParams.get('channel') // 'email', 'sms', 'webform', etc.
    const label = searchParams.get('label') // Specific label filter
    const limit = parseInt(searchParams.get('limit') || '50')
    const cursor = searchParams.get('cursor') // For pagination
    const search = searchParams.get('search') // Search query

    // Build base query
    let query = supabase
      .from('unified_messages')
      .select(`
        *,
        contacts:contact_id (
          id,
          name,
          email,
          phone,
          first_name,
          last_name
        ),
        leads:lead_id (
          id,
          name,
          email,
          status,
          estimated_job_value
        ),
        roofing_jobs:job_id (
          id,
          title,
          status,
          job_value,
          current_stage,
          scheduled_start_date
        )
      `)
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Apply channel filter
    if (channel) {
      query = query.eq('channel', channel)
    }

    // Apply search filter
    if (search) {
      query = query.or(`subject.ilike.%${search}%,body_text.ilike.%${search}%,from_address.ilike.%${search}%`)
    }

    // Apply label filter
    if (label) {
      query = query.contains('labels', [label])
    }

    // Apply cursor-based pagination
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    // Apply enhanced filters
    switch (filter) {
      case 'homeowners':
        // Messages from contacts that are homeowners (have jobs or leads)
        query = query.not('contact_id', 'is', null)
        break

      case 'leads':
        // Messages linked to leads that haven't been converted to jobs
        query = query.not('lead_id', 'is', null)
          .is('job_id', null)
        break

      case 'insurance':
        // Messages with insurance-related intent or label
        query = query.or('ai_intent.ilike.%insurance%,ai_intent.ilike.%adjuster%,ai_intent.ilike.%claim%,labels.cs.{insurance}')
        break

      case 'suppliers':
        // Messages from suppliers (can be identified by from_address domain or label)
        query = query.contains('labels', ['supplier'])
          .or('channel.eq.webform,from_address.ilike.%@supplier%')
        break

      case 'crews':
        // Messages from crew members
        query = query.contains('labels', ['crew'])
          .or('channel.eq.internal_note,from_address.ilike.%@crew%')
        break

      case 'high_priority':
        // High priority messages
        query = query.in('ai_priority', ['high', 'urgent'])
        break

      case 'needs_follow_up':
        // Messages that need follow-up
        query = query.eq('needs_follow_up', true)
        break

      case 'hot_leads':
        // Hot lead messages
        query = query.contains('labels', ['hot_lead'])
          .or('ai_priority.eq.urgent,leads.lead_heat_score.gte.80')
        break

      case 'scheduled_jobs':
        // Messages from scheduled jobs
        query = query.not('job_id', 'is', null)
          .eq('roofing_jobs.status', 'scheduled')
        break

      case 'completed_jobs':
        // Messages from completed jobs
        query = query.not('job_id', 'is', null)
          .eq('roofing_jobs.status', 'completed')
        break

      case 'all':
      default:
        // No additional filter
        break
    }

    const { data: messages, error } = await query

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    // Get next cursor for pagination
    const nextCursor = messages.length === limit && messages.length > 0
      ? messages[messages.length - 1].created_at
      : null

    return NextResponse.json({
      messages: messages || [],
      pagination: {
        limit,
        has_more: nextCursor !== null,
        cursor: nextCursor
      }
    })
  } catch (error) {
    console.error('Error in GET /api/messaging-hub/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/messaging-hub/messages
 * Create a new unified message
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id, user_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const {
      lead_id,
      job_id,
      contact_id,
      thread_id,
      campaign_id,
      channel,
      direction,
      from_address,
      to_address,
      subject,
      body_text,
      body_html,
      external_id,
      external_provider,
      external_metadata,
      labels,
      ai_intent,
      ai_priority,
      assigned_to,
      routed_to_role
    } = body

    // Validate required fields
    if (!channel || !direction) {
      return NextResponse.json(
        { error: 'channel and direction are required' },
        { status: 400 }
      )
    }

    // Insert message
    const { data: message, error } = await supabase
      .from('unified_messages')
      .insert({
        workspace_id,
        lead_id,
        job_id,
        contact_id,
        thread_id,
        campaign_id,
        channel,
        direction,
        from_address,
        to_address,
        subject,
        body_text,
        body_html,
        external_id,
        external_provider,
        external_metadata: external_metadata || {},
        labels: labels || [],
        ai_intent,
        ai_priority: ai_priority || 'normal',
        assigned_to,
        routed_to_role,
        status: direction === 'outbound' ? 'sent' : 'delivered',
        sent_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating message:', error)
      return NextResponse.json(
        { error: 'Failed to create message' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error in POST /api/messaging-hub/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

