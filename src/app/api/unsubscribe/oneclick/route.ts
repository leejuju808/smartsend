import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: row } = await supabase
      .from('unsubscribe_tokens')
      .select('email, org_id, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!row) {
      // Return 2xx even if unknown to avoid retries
      return NextResponse.json({ ok: true })
    }

    // Check if token is expired
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return NextResponse.json({ ok: true })
    }

    // Add to suppression list
    await supabase.from('suppression_list').upsert({
      email: row.email,
      org_id: row.org_id,
      reason: 'user_unsubscribed',
      source: 'one_click'
    }, { onConflict: 'email,org_id' })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error in one-click unsubscribe:', error)
    // Return 2xx to avoid retries
    return NextResponse.json({ ok: true })
  }
}
