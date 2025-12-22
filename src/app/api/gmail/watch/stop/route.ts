// /app/api/gmail/watch/stop/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureAccessToken } from '@/lib/googleTokens'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  // Try email first, fallback to account_email
  let { data: acct, error } = await supabase
    .from('connected_accounts')
    .select('id,email,account_email,access_token,refresh_token,token_expiry,expires_at')
    .eq('provider', 'gmail')
    .eq('email', email)
    .maybeSingle()
  
  // If not found, try account_email
  if (!acct) {
    ({ data: acct, error } = await supabase
      .from('connected_accounts')
      .select('id,email,account_email,access_token,refresh_token,token_expiry,expires_at')
      .eq('provider', 'gmail')
      .eq('account_email', email)
      .maybeSingle())
  }
  
  if (error || !acct) return NextResponse.json({ error: 'account not found' }, { status: 404 })
  
  const accountEmail = acct.email || acct.account_email || email
  const tokenExpiry = acct.token_expiry || acct.expires_at

  // token
  let access_token = acct.access_token
  try {
    const refreshed = await ensureAccessToken({
      access_token: acct.access_token,
      refresh_token: acct.refresh_token,
      token_expiry: tokenExpiry
    })
    access_token = refreshed.access_token
  } catch (_) {}

  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}` }
  })
  // no body on success
  await supabase.from('gmail_watch_logs').insert({ email: accountEmail, action: 'stop' })

  return NextResponse.json({ ok: r.ok })
}

