import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { email, orgId } = await req.json()
    if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Reuse existing valid token if present
    const { data: existing } = await supabase
      .from('unsubscribe_tokens')
      .select('token, expires_at')
      .eq('email', email.toLowerCase())
      .eq('org_id', orgId || null)
      .limit(1)
      .maybeSingle()

    let token = existing?.token
    if (!token || (existing?.expires_at && new Date(existing.expires_at) < new Date())) {
      token = crypto.randomBytes(18).toString('base64url')
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString() // 1 year
      
      await supabase.from('unsubscribe_tokens').upsert({
        email: email.toLowerCase(),
        org_id: orgId || null,
        token,
        expires_at: expiresAt,
      }, {
        onConflict: 'token'
      })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return NextResponse.json({ 
      token, 
      url: `${baseUrl}/u/${token}` 
    })
  } catch (error: any) {
    console.error('Error creating unsubscribe token:', error)
    return NextResponse.json({ error: error.message || 'Failed to create token' }, { status: 500 })
  }
}
