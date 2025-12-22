// supabase/functions/send-reply/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Req = {
  user_id: string
  mailbox_id: string
  thread_key: string
  to: string
  subject?: string
  body_html: string
  body_text?: string
  provider: 'gmail'|'outlook'
  provider_thread_id?: string | null
}

function base64UrlEncode(str: string) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function buildRfc822(params: { from: string; to: string; subject: string; html: string; text?: string; threadId?: string | null }) {
  const boundary = "smartsend_" + crypto.randomUUID().slice(0, 8)
  const text = params.text || params.html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()
  
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...(params.threadId ? [`In-Reply-To: <${params.threadId}>`, `References: <${params.threadId}>`] : [])
  ].join("\r\n")

  const body = `--${boundary}
Content-Type: text/plain; charset="UTF-8"

${text}

--${boundary}
Content-Type: text/html; charset="UTF-8"

${params.html}

--${boundary}--`

  return base64UrlEncode(`${headers}\r\n\r\n${body}`)
}

async function ensureFreshToken(accountId: string, userId: string) {
  const { data: acc } = await supabase
    .from('connected_accounts')
    .select('expires_at')
    .eq('id', accountId)
    .maybeSingle()

  const soon = !acc?.expires_at || new Date(acc.expires_at).getTime() < Date.now() + 120_000
  if (!soon) return

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/oauth-refresh`
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ account_id: accountId, user_id: userId })
  }).catch((err) => {
    console.error('ensureFreshToken failed', err)
  })
}

async function sendViaGmail(userId: string, mailboxId: string, to: string, subject: string, html: string, threadId?: string|null) {
  await ensureFreshToken(mailboxId, userId)

  const { data: mailbox, error } = await supabase
    .from('connected_accounts')
    .select('email, access_token, provider')
    .eq('id', mailboxId)
    .eq('provider', 'gmail')
    .single()

  if (error || !mailbox) throw new Error('Mailbox not found')
  if (!mailbox.access_token) throw new Error('Missing Gmail access token')

  const raw = buildRfc822({
    from: mailbox.email,
    to,
    subject,
    html,
    threadId: threadId || undefined
  })

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mailbox.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, threadId: threadId || undefined })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail send failed: ${text}`)
  }

  const data = await res.json()
  return { id: data.id, threadId: data.threadId || threadId }
}

async function sendViaOutlook(userId: string, mailboxId: string, to: string, subject: string, html: string, threadId?: string|null) {
  await ensureFreshToken(mailboxId, userId)

  const { data: mailbox, error } = await supabase
    .from('connected_accounts')
    .select('email, access_token, provider')
    .eq('id', mailboxId)
    .eq('provider', 'outlook')
    .single()

  if (error || !mailbox) throw new Error('Outlook mailbox not found')
  if (!mailbox.access_token) throw new Error('Missing Outlook access token')

  const payload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      ...(threadId ? { conversationId: threadId } : {})
    },
    saveToSentItems: true
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mailbox.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Outlook send failed: ${text}`)
  }

  return { id: `outlook-${Date.now()}`, threadId: threadId || null }
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const body = await req.json() as Req
  const subject = body.subject || ''

  // 1) Send
  const sent = body.provider === 'gmail'
    ? await sendViaGmail(body.user_id, body.mailbox_id, body.to, subject, body.body_html, body.provider_thread_id)
    : await sendViaOutlook(body.user_id, body.mailbox_id, body.to, subject, body.body_html, body.provider_thread_id)

  // 2) Log outbound message into inbox_messages (direction='out')
  const { data: msg } = await supabase
    .from('inbox_messages')
    .insert({
      user_id: body.user_id,
      campaign_id: null,
      mailbox_id: body.mailbox_id,
      lead_id: null,
      provider: body.provider,
      provider_msg_id: sent.id,
      provider_thread_id: sent.threadId ?? body.provider_thread_id ?? null,
      direction: 'out',
      from_email: null,
      to_email: body.to,
      subject,
      body_text: body.body_text ?? '',
      body_html: body.body_html,
      received_at: new Date().toISOString(),
      is_reply: false,
      reply_label: null,
      thread_key: body.provider_thread_id || body.thread_key
    })
    .select('id').single()

  if (!msg) {
    return new Response(JSON.stringify({ error: 'Failed to log message' }), { status: 500 })
  }

  // 3) Update thread: decrement unread, bump last_activity
  await supabase.rpc('incr_thread_unread', { p_key: body.provider_thread_id || body.thread_key, p_delta: -9999 })

  return new Response(JSON.stringify({ ok: true, provider_msg_id: sent.id, thread_id: sent.threadId ?? null }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

