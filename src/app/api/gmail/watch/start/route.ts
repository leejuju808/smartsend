// /app/api/gmail/watch/start/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureAccessToken } from '@/lib/googleTokens'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TOPIC = process.env.GMAIL_TOPIC!
const GMAIL_LABELS = (process.env.GMAIL_LABELS || '').split(',').map(s => s.trim()).filter(Boolean)

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  // Try email first, fallback to account_email
  let { data: acct, error } = await supabase
    .from('connected_accounts')
    .select('id,email,account_email,access_token,refresh_token,token_expiry,expires_at,last_history_id')
    .eq('provider', 'gmail')
    .eq('email', email)
    .maybeSingle()
  
  // If not found, try account_email
  if (!acct) {
    ({ data: acct, error } = await supabase
      .from('connected_accounts')
      .select('id,email,account_email,access_token,refresh_token,token_expiry,expires_at,last_history_id')
      .eq('provider', 'gmail')
      .eq('account_email', email)
      .maybeSingle())
  }
  
  if (error || !acct) return NextResponse.json({ error: 'account not found' }, { status: 404 })
  
  // Normalize email and token_expiry
  const accountEmail = acct.email || acct.account_email || email
  const tokenExpiry = acct.token_expiry || acct.expires_at

  // Ensure valid access token
  let access_token = acct.access_token
  try {
    const refreshed = await ensureAccessToken({
      access_token: acct.access_token,
      refresh_token: acct.refresh_token,
      token_expiry: tokenExpiry
    })
    access_token = refreshed.access_token
    if (refreshed.expires_in) {
      const updateData: any = {
        access_token,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      }
      // Also update expires_at if it exists
      if (acct.expires_at !== undefined) {
        updateData.expires_at = updateData.token_expiry
      }
      await supabase.from('connected_accounts').update(updateData).eq('id', acct.id)
    }
  } catch (_) {}

  // Start watch
  const body: any = { topicName: TOPIC }
  if (GMAIL_LABELS.length) body.labelIds = GMAIL_LABELS

  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: 502 })
  const j = await r.json() as { historyId?: string; expiration?: string }

  await supabase.from('connected_accounts').update({
    last_history_id: j.historyId ? String(j.historyId) : acct.last_history_id,
    updated_at: new Date().toISOString()
  }).eq('id', acct.id)

  // Optional: store meta
  await supabase.from('gmail_watch_logs').insert({
    email: accountEmail,
    action: 'start',
    history_id: j.historyId ?? null,
    expiration_ms: j.expiration ?? null
  })

  return NextResponse.json({ ok: true, historyId: j.historyId, expiration: j.expiration })
}

