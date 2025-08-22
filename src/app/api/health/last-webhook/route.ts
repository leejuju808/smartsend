import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('analytics_events')
      .select('id,name,context,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    const events = (data as any[]) || []
    const lastWebhook = events.find((e: any) => {
      const ev = (e?.context as any)?.event as string | undefined
      return ev?.startsWith('webhook_')
    }) || null
    return NextResponse.json({ ok: true, last: lastWebhook })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Internal error' }, { status: 500 })
  }
}

