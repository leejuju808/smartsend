import 'server-only'
import { requireQuota, recordUsage, getFreeDailyQuota, getUsageCountToday } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const kind = (body?.kind || 'demo').toString()
  const gate = await requireQuota(kind)
  if (!gate.allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'quota_exceeded', quota: gate.quota, used: gate.used }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
  await recordUsage(gate.user.id, kind)
  const used = await getUsageCountToday(gate.user.id, kind)
  const quota = getFreeDailyQuota(kind)
  return new Response(JSON.stringify({ ok: true, kind, used, remaining: Math.max(quota - used, 0), quota }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

