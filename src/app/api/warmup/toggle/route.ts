// Block 18: Warm-up Toggle API
// SmartSend — API endpoint to pause/resume warm-up

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const id = form.get('id') as string

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get current paused state
    const { data: row, error: fetchError } = await supabaseAdmin
      .from('warmup_state')
      .select('paused')
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !row) {
      return NextResponse.json({ ok: false, error: 'warmup not found' }, { status: 404 })
    }

    // Toggle paused state
    const { error: updateError } = await supabaseAdmin
      .from('warmup_state')
      .update({ paused: !row.paused })
      .eq('id', id)

    if (updateError) {
      console.error('Error toggling warmup:', updateError)
      return NextResponse.json({ ok: false, error: 'failed to update' }, { status: 500 })
    }

    // Redirect back to settings
    return NextResponse.redirect(new URL('/settings/deliverability', req.url))
  } catch (error: any) {
    console.error('Toggle warmup error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}

