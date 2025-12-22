// /app/api/gmail/watch/renew/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(_: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: accts, error } = await supabase
    .from('connected_accounts')
    .select('email,account_email')
    .eq('provider','gmail')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const a of accts ?? []) {
    const email = a.email || a.account_email
    if (!email) continue
    const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/gmail/watch/start`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email })
    })
    results.push({ email, ok: r.ok })
  }
  return NextResponse.json({ ok: true, results })
}

