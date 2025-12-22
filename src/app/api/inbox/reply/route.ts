import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

export const runtime = 'nodejs' // Needed for Buffer

// Helper: RFC2822 → base64url
function encodeBase64Url(str: string) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(req: NextRequest) {
  const { threadId, to, from, subject, bodyText } = await req.json()
  if (!threadId || !to || !from) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  // Get user's Gmail access token from connected_accounts
  // First, get the user_id from the thread (campaign_logs -> leads)
  const { data: thread, error: threadErr } = await supabaseAdmin
    .from('campaign_logs')
    .select('lead_id, campaign_id, leads!inner(user_id), campaigns(user_id)')
    .eq('id', threadId)
    .single()

  if (threadErr || !thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  // Get user_id from leads or campaigns
  const userId = (thread as any).leads?.user_id || (thread as any).campaigns?.user_id
  if (!userId) {
    return NextResponse.json({ error: 'Could not determine user' }, { status: 400 })
  }

  const { data: acct, error: acctErr } = await supabaseAdmin
    .from('connected_accounts')
    .select('provider, access_token, email')
    .eq('provider', 'gmail')
    .eq('user_id', userId)
    .single()

  if (acctErr || !acct?.access_token) {
    return NextResponse.json({ error: 'No Gmail account connected' }, { status: 400 })
  }

  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject || ''}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    '',
    bodyText || ''
  ].join('\r\n')

  // Send via Gmail
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${acct.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodeBase64Url(raw) })
  })

  if (!res.ok) {
    const t = await res.text()
    return NextResponse.json({ error: `Gmail send failed: ${t}` }, { status: 502 })
  }
  const json = await res.json()

  // Persist optimistic result
  const { error: insErr } = await supabaseAdmin.from('messages').insert({
    thread_id: threadId,
    direction: 'outgoing',
    subject,
    body_text: bodyText,
    from_email: from,
    to_email: to,
    external_id: json?.id,
    sent_at: new Date().toISOString()
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Touch thread for ordering
  await supabaseAdmin.from('campaign_logs')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId)

  return NextResponse.json({ ok: true, id: json?.id })
}

