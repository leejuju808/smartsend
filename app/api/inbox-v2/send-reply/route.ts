import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/inbox-v2/send-reply
 * Send a reply message
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { thread_id, to, subject, body_text, body_html } = body

    if (!thread_id || !to || !body_text) {
      return NextResponse.json(
        { error: 'Missing required fields: thread_id, to, body_text' },
        { status: 400 }
      )
    }

    // Get thread
    const { data: thread } = await supabase
      .from('inbox_threads')
      .select('*')
      .eq('id', thread_id)
      .single()

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      )
    }

    // Create message (assuming inbox_messages table)
    const { data: message, error: messageError } = await supabase
      .from('inbox_messages')
      .insert({
        thread_id,
        direction: 'outbound',
        from_email: null, // Will be set by email sending service
        to_email: to,
        subject: subject || thread.subject,
        body_text,
        body_html: body_html || body_text.replace(/\n/g, '<br/>'),
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (messageError) {
      console.error('Error creating message:', messageError)
      return NextResponse.json(
        { error: 'Failed to create message', details: messageError.message },
        { status: 500 }
      )
    }

    // Update thread
    await supabase
      .from('inbox_threads')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_snippet: body_text.substring(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', thread_id)

    // Create deliverability status
    await supabase
      .from('email_deliverability_status')
      .insert({
        message_id: message.id,
        thread_id,
        workspace_id,
        status: 'queued',
      })

    // TODO: Actually send email via your email service
    // This would integrate with your email sending infrastructure

    return NextResponse.json({ 
      success: true, 
      message_id: message.id 
    })
  } catch (error: any) {
    console.error('Error in POST /api/inbox-v2/send-reply:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





















































