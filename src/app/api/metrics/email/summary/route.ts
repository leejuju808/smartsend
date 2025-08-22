import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ ok: true, sent: 0, opened: 0, replied: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('analytics_events')
    .select('name')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .limit(5000)

  let sent = 0, opened = 0, replied = 0
  for (const r of data || []) {
    const n = (r as any).name as string
    if (n === 'email_sent') sent += 1
    if (n === 'email_opened') opened += 1
    if (n === 'email_replied') replied += 1
  }

  return new Response(JSON.stringify({ ok: true, sent, opened, replied }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

