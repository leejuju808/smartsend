// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type Cred = {
  account_id: string; provider: 'gmail'|'outlook'|'smtp';
  access_token?: string; refresh_token?: string; expires_at?: string;
  tenant_id?: string; smtp_host?: string; smtp_port?: number; smtp_user?: string; smtp_pass?: string;
}
type Account = { id: string; provider: 'gmail'|'outlook'|'smtp'; email_address: string; from_name: string }

export async function sendEmail(accountId: string, rawRfc822: string): Promise<{providerId?: string}> {
  const { data: acct } = await sb.from('connected_accounts').select('id,provider,email_address,from_name').eq('id', accountId).single()
  if (!acct) throw new Error('account not found')
  const { data: cred } = await sb.from('account_credentials').select('*').eq('account_id', accountId).single()
  if (!cred) throw new Error('credentials missing')

  if (isExpired(cred.expires_at) && cred.refresh_token && (acct.provider === 'gmail' || acct.provider === 'outlook')) {
    const refreshed = await refresh(acct.provider, cred)
    await sb.from('account_credentials').update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + (refreshed.expires_in-60)*1000).toISOString(),
      refresh_token: refreshed.refresh_token ?? cred.refresh_token
    }).eq('account_id', accountId)
    cred.access_token = refreshed.access_token
  }

  if (acct.provider === 'gmail') {
    const providerId = await gmailSend(cred.access_token!, rawRfc822)
    return { providerId }
  } else if (acct.provider === 'outlook') {
    const providerId = await outlookSend(cred.access_token!, rawRfc822)
    return { providerId }
  } else {
    await smtpSend({ host: cred.smtp_host!, port: cred.smtp_port!, user: cred.smtp_user!, pass: cred.smtp_pass! }, rawRfc822)
    return {}
  }
}

function isExpired(expires_at?: string) {
  if (!expires_at) return false
  return new Date(expires_at).getTime() - Date.now() < 60_000
}

async function refresh(provider: 'gmail'|'outlook', cred: Cred) {
  if (provider === 'gmail') {
    const body = new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
      refresh_token: cred.refresh_token!
    })
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
    if (!r.ok) throw new Error('gmail token refresh failed')
    return await r.json() as { access_token: string, expires_in: number, refresh_token?: string }
  } else {
    const body = new URLSearchParams({
      client_id: Deno.env.get('MS_CLIENT_ID')!,
      client_secret: Deno.env.get('MS_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
      refresh_token: cred.refresh_token!,
      scope: 'https://graph.microsoft.com/.default offline_access'
    })
    const tenant = cred.tenant_id || 'common'
    const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body })
    if (!r.ok) throw new Error('outlook token refresh failed')
    return await r.json() as { access_token: string, expires_in: number, refresh_token?: string }
  }
}

async function gmailSend(access_token: string, raw: string) {
  const base64url = btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ raw: base64url })
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`gmail send error: ${j.error?.message || r.statusText}`)
  return j.id as string
}

async function outlookSend(access_token: string, raw: string) {
  // Graph supports RFC822 via /sendMail? Not directly. We convert raw to base64 and use internetMessageHeaders minimally.
  // Easiest path: /me/sendMail with simple JSON, but we want to preserve our MIME. For MVP, send simple JSON:
  const parsed = parseSimpleForGraph(raw)
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      message: {
        subject: parsed.subject,
        body: { contentType: 'HTML', content: parsed.html || parsed.text || '' },
        toRecipients: [{ emailAddress: { address: parsed.to } }],
        from: { emailAddress: { address: parsed.fromEmail } }
      },
      saveToSentItems: true
    })
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`outlook send error: ${t}`)
  }
  // Graph doesn't return id here; omit for now.
  return undefined
}

function parseSimpleForGraph(raw: string) {
  const head = raw.split('\r\n\r\n')[0]
  const get = (k:string) => (head.match(new RegExp(`^${k}:\\s*(.*)$`, 'mi'))||[])[1]?.trim()
  const to = get('To') || ''
  const from = get('From') || ''
  const subject = get('Subject') || ''
  const fromEmail = (from.match(/<([^>]+)>/)||[])[1] || from
  // cheap extract html part
  const html = raw.includes('Content-Type: text/html') ? raw.split('Content-Type: text/html')[1] : ''
  return { to, fromEmail, subject, html, text: '' }
}

async function smtpSend(opts: { host: string, port: number, user: string, pass: string }, raw: string) {
  // For a future SMTP path, call a relay service or custom SMTP client.
  // MVP: skip implementation.
  throw new Error('SMTP not implemented')
}

