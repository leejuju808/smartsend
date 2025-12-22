import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function gmailSend(accessToken: string, raw: string) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }) // base64url encoded RFC 2822 message
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function base64url(input: string) {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

Deno.serve(async (req) => {
  try {
    const { user_id, to, subject, body, thread_id } = await req.json()

    // 1) Get user's connected Gmail
    const { data: acc, error: accErr } = await supabase
      .from('connected_accounts')
      .select('access_token, email')
      .eq('user_id', user_id)
      .eq('provider', 'gmail')
      .maybeSingle()
    if (accErr || !acc) return new Response('No Gmail account', { status: 400 })

    // 2) Compose very basic RFC 2822
    const from = acc.email
    const headers = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset="UTF-8"`
    ]
    if (thread_id) {
      headers.push(`In-Reply-To: ${thread_id}`)
      headers.push(`References: ${thread_id}`)
    }
    const msg = headers.join('\r\n') + '\r\n\r\n' + body

    const raw = base64url(msg)
    const sent = await gmailSend(acc.access_token, raw)

    // 3) Optimistic insert to inbox (mirrors outbound)
    await supabase.from('send_logs').insert({
      user_id, status: 'sent', sent_at: new Date().toISOString(),
      subject, recipient_email: to
    })

    return new Response(JSON.stringify({ ok: true, sent }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})

