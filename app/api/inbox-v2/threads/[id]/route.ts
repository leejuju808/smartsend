import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * GET /api/inbox-v2/threads/[id]
 * Get thread detail with messages, AI analysis, and suggestions
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()
    const threadId = params.id

    // Get thread
    const { data: thread, error: threadError } = await supabase
      .from('inbox_threads')
      .select('*')
      .eq('id', threadId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    // Get messages (assuming inbox_messages table)
    const { data: messages, error: messagesError } = await supabase
      .from('inbox_messages')
      .select(`
        id,
        direction,
        from_email,
        to_email,
        subject,
        body_text,
        body_html,
        sent_at,
        message_attachments (
          id,
          file_name,
          file_type,
          file_url
        ),
        email_deliverability_status (
          status,
          status_updated_at
        )
      `)
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: true })

    // Get contact
    let contact = null
    if (thread.contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, phone')
        .eq('id', thread.contact_id)
        .single()
      contact = contactData
    }

    // Get AI analysis
    const { data: analysis } = await supabase
      .from('ai_reply_analysis')
      .select('*')
      .eq('thread_id', threadId)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single()

    // Get suggestions
    const { data: suggestions } = await supabase
      .from('inbox_suggestions')
      .select('*')
      .eq('thread_id', threadId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    // Transform messages
    const transformedMessages = (messages || []).map((msg: any) => ({
      id: msg.id,
      direction: msg.direction === 'inbound' ? 'in' : 'out',
      from_email: msg.from_email,
      to_email: msg.to_email,
      subject: msg.subject,
      body_text: msg.body_text,
      body_html: msg.body_html,
      sent_at: msg.sent_at,
      attachments: msg.message_attachments || [],
      deliverability_status: msg.email_deliverability_status?.[0] ? {
        status: msg.email_deliverability_status[0].status,
        status_updated_at: msg.email_deliverability_status[0].status_updated_at,
      } : undefined,
    }))

    return NextResponse.json({
      thread: {
        id: thread.id,
        thread_key: thread.thread_key,
        subject: thread.subject,
        homeowner_name: thread.homeowner_name,
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
      },
      messages: transformedMessages,
      contact,
      ai_analysis: analysis ? {
        intent_type: analysis.intent_type,
        emotional_tone: analysis.emotional_tone,
        urgency_level: analysis.urgency_level,
        has_insurance_intent: analysis.has_insurance_intent || false,
        has_booking_intent: analysis.has_booking_intent || false,
        has_storm_damage: analysis.has_storm_damage || false,
        extracted_questions: analysis.extracted_questions || [],
        suggested_actions: analysis.suggested_actions || [],
        suggested_pipeline_stage: analysis.suggested_pipeline_stage,
      } : null,
      suggestions: suggestions ? {
        suggested_replies: suggestions.suggested_replies || [],
        booking_suggestions: suggestions.booking_suggestions || [],
        insurance_actions: suggestions.insurance_actions || [],
        storm_actions: suggestions.storm_actions || [],
      } : null,
    })
  } catch (error: any) {
    console.error('Error in GET /api/inbox-v2/threads/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































