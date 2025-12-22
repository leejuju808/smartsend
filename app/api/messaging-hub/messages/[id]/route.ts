import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * GET /api/messaging-hub/messages/[id]
 * Get a single message with full details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const { id } = await params
    const supabase = getServerSupabase()

    const { data: message, error } = await supabase
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
          estimated_job_value,
          address,
          city,
          state
        ),
        roofing_jobs:job_id (
          id,
          title,
          status,
          job_value,
          current_stage,
          scheduled_start_date,
          deposit_paid,
          balance_remaining
        ),
        internal_comments:message_internal_comments (
          id,
          body,
          created_by,
          created_at,
          created_by_user:created_by (
            id,
            email,
            full_name
          )
        ),
        ai_suggestions:ai_message_suggestions (
          id,
          suggestion_type,
          suggested_text,
          suggested_subject,
          created_at
        )
      `)
      .eq('id', id)
      .eq('workspace_id', workspace_id)
      .single()

    if (error) {
      console.error('Error fetching message:', error)
      return NextResponse.json(
        { error: 'Failed to fetch message' },
        { status: 500 }
      )
    }

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error in GET /api/messaging-hub/messages/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/messaging-hub/messages/[id]
 * Update a message (labels, assigned_to, needs_follow_up, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const { id } = await params
    const supabase = getServerSupabase()

    const body = await req.json()
    const {
      labels,
      assigned_to,
      routed_to_role,
      needs_follow_up,
      follow_up_due_at,
      ai_intent,
      ai_priority,
      status,
      read_at
    } = body

    // Build update object
    const updates: any = {}
    if (labels !== undefined) updates.labels = labels
    if (assigned_to !== undefined) updates.assigned_to = assigned_to
    if (routed_to_role !== undefined) updates.routed_to_role = routed_to_role
    if (needs_follow_up !== undefined) updates.needs_follow_up = needs_follow_up
    if (follow_up_due_at !== undefined) updates.follow_up_due_at = follow_up_due_at
    if (ai_intent !== undefined) updates.ai_intent = ai_intent
    if (ai_priority !== undefined) updates.ai_priority = ai_priority
    if (status !== undefined) updates.status = status
    if (read_at !== undefined) updates.read_at = read_at

    const { data: message, error } = await supabase
      .from('unified_messages')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspace_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating message:', error)
      return NextResponse.json(
        { error: 'Failed to update message' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error in PATCH /api/messaging-hub/messages/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






































