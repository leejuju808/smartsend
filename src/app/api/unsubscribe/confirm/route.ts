import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { token, email, orgId } = await req.json()

    if (!token || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify token matches email
    const { data: tokenRow } = await supabase
      .from('unsubscribe_tokens')
      .select('email, org_id, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!tokenRow || tokenRow.email !== email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 })
    }

    // Add to suppression list
    await supabase.from('suppression_list').upsert({
      email,
      org_id: orgId || tokenRow.org_id || null,
      reason: 'user_unsubscribed',
      source: 'page'
    }, {
      onConflict: 'email,org_id'
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error confirming unsubscribe:', error)
    return NextResponse.json({ error: error.message || 'Failed to unsubscribe' }, { status: 500 })
  }
}

