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
    const orgId = String(body?.orgId || '')
    const email = String(body?.email || '')
    const campaignId = String(body?.campaignId || '')
    
    if (!userId || !threadMessageId) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 })
    
    const sb = createAdminClient()
    await sb.from('analytics_events').insert({ name: 'email_replied', user_id: userId, context: { threadMessageId } })
    
    // Trigger integrations webhook if we have org context
    if (orgId && email) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'reply',
          email,
          campaign_id: campaignId || undefined,
          org_id: orgId,
          thread_message_id: threadMessageId
        })
      }).catch(() => {}) // Don't block on webhook failures
    }
    
    // Optional: ensure a deal exists for the latest contact that replied under this user/workspace
    // If email_replies table is used elsewhere, triggers will handle auto-deal creation.
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 })
  }
}

