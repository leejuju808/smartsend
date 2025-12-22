import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const { lead_id, reply_id } = await req.json()

    if (!lead_id) {
      return NextResponse.json(
        { error: { message: 'lead_id is required' } },
        { status: 400 }
      )
    }

    const { error } = await supabase.rpc('mark_lead_replied', {
      p_lead_id: lead_id,
      p_reply_id: reply_id ?? null
    })

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? 'Unexpected error' } },
      { status: 500 }
    )
  }
}

