import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Fetch thread with intent data
  const { data: thread } = await supabaseAdmin
    .from('email_threads')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  // Fetch messages with intent classification data
  const { data: messages } = await supabaseAdmin
    .from('email_messages')
    .select('id, thread_id, from_address, to_address, subject, body_html, direction, sent_at, intent, intent_confidence, extracted_contacts, extracted_times, follow_up_at')
    .eq('thread_id', id)
    .order('sent_at', { ascending: true })

  return NextResponse.json({ 
    thread: {
      ...thread,
      last_intent: thread.last_intent,
      status: thread.status,
      owner_id: thread.owner_id
    }, 
    messages: messages || [] 
  })
}

