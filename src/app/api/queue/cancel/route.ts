import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: { message: 'ids required' } }, { status: 400 })
    }
    
    const sb = createRouteHandlerClient({ cookies })
    const { error } = await sb
      .from('send_queue')
      .update({ status: 'canceled', cancel_reason: 'manual' } as any)
      .in('id', ids)
    
    if (error) return NextResponse.json({ error }, { status: 400 })
    
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: { message: e?.message ?? 'Unexpected error' } }, { status: 500 })
  }
}
