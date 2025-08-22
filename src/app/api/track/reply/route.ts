import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const userId = String(body?.userId || '')
    const threadMessageId = String(body?.threadMessageId || '')
    if (!userId || !threadMessageId) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 })
    const sb = createAdminClient()
    await sb.from('analytics_events').insert({ name: 'email_replied', user_id: userId, context: { threadMessageId } })
    // Optional: ensure a deal exists for the latest contact that replied under this user/workspace
    // If email_replies table is used elsewhere, triggers will handle auto-deal creation.
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 })
  }
}

