// app/api/inbox/threads/[key]/route.ts  (detail: messages + lead)
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(_: Request, { params }: { params: { key: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: msgs, error } = await supabase
    .from('inbox_messages')
    .select('id,direction,from_email,to_email,subject,body_text,body_html,received_at,reply_label,provider,provider_thread_id')
    .eq('thread_key', params.key)
    .order('received_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Optional: include lead snapshot and mailbox for provider detection
  const { data: th } = await supabase
    .from('inbox_threads')
    .select('lead_id,campaign_id,mailbox_id,user_id')
    .eq('thread_key', params.key)
    .single()
  
  // Get mailbox provider if available
  let mailboxProvider: 'gmail' | 'outlook' | null = null
  if (th?.mailbox_id) {
    const { data: mailbox } = await supabase
      .from('connected_accounts')
      .select('provider')
      .eq('id', th.mailbox_id)
      .maybeSingle()
    mailboxProvider = mailbox?.provider === 'gmail' ? 'gmail' : mailbox?.provider === 'outlook' ? 'outlook' : null
  }
  
  let lead = null
  if (th?.lead_id) {
    const res = await supabase
      .from('campaign_leads')
      .select('id,email,first_name,last_name,company,title,linkedin_url')
      .eq('id', th.lead_id)
      .maybeSingle()
    lead = res.data || null
  }

  // Determine provider from first message or mailbox
  const provider = msgs?.[0]?.provider || mailboxProvider || 'gmail'
  const providerThreadId = msgs?.find(m => m.provider_thread_id)?.provider_thread_id || null

  return NextResponse.json({ messages: msgs, lead, thread: th, provider, provider_thread_id: providerThreadId })
}

