import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get('id')
  if (!threadId) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  // Fetch thread data
  const { data: thread, error: threadError } = await supabaseAdmin
    .from('inbox_threads')
    .select('id, thread_key, subject, status, last_ai_label, campaign_id, assigned_to, assignee_id, stopped_by_reply, replied_at, updated_at')
    .or(`id.eq.${threadId},thread_key.eq.${threadId}`)
    .maybeSingle()

  // Fetch intelligence from reply_threads if available
  let intelligence: any = null
  if (thread?.campaign_id) {
    // Try to find reply_thread by campaign_id and lead_id
    const { data: replyThread } = await supabaseAdmin
      .from('reply_threads')
      .select('ai_summary, ai_action_items, ai_tone, ai_objections, ai_buyer_role, ai_opportunity_score')
      .eq('campaign_id', thread.campaign_id)
      .maybeSingle()
    
    if (replyThread) {
      intelligence = replyThread
    }
  }

  // Fetch messages - try both tables
  let messages: any[] = []
  
  // Try inbox_messages first
  const { data: inboxMessages } = await supabaseAdmin
    .from('inbox_messages')
    .select('*')
    .or(`thread_id.eq.${threadId},thread_key.eq.${threadId}`)
    .order('sent_at', { ascending: true })
    .order('received_at', { ascending: true })

  if (inboxMessages && inboxMessages.length > 0) {
    messages = inboxMessages
  } else {
    // Fallback to messages table
    const { data: msgData } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: true })
    
    if (msgData) {
      messages = msgData
    }
  }

  if (threadError && !thread) {
    return NextResponse.json({ error: threadError?.message || 'Thread not found' }, { status: 500 })
  }

  return NextResponse.json({ 
    thread: {
      ...(thread || { id: threadId, status: 'open' }),
      ...(intelligence || {}),
    },
    messages: messages ?? [] 
  })
}

