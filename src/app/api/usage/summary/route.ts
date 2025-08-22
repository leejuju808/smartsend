import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = createServerComponentClient()
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) {
    return new Response(
      JSON.stringify({ ok: true, kinds: [], total: { today: 0, week: 0 } }),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
    )
  }

  const sb = createAdminClient()
  const startDay = new Date(); startDay.setHours(0, 0, 0, 0)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const { data: rows } = await sb
    .from('usage_events')
    .select('kind, qty, created_at')
    .eq('user_id', user.id)
    .gte('created_at', since7d.toISOString())
    .limit(5000)

  const todayMap = new Map<string, number>()
  const weekMap = new Map<string, number>()
  let totToday = 0, totWeek = 0
  for (const r of rows || []) {
    const k = (r as any).kind as string
    const rawQty = (r as any).qty
    const q = Number(rawQty == null ? 0 : rawQty)
    const t = new Date((r as any).created_at)
    weekMap.set(k, (weekMap.get(k) || 0) + q); totWeek += q
    if (t >= startDay) { todayMap.set(k, (todayMap.get(k) || 0) + q); totToday += q }
  }
  const kinds = Array.from(new Set([...(rows || []).map((r: any) => r.kind)])).sort()
  const body = {
    ok: true,
    kinds: kinds.map(k => ({ kind: k, today: todayMap.get(k) || 0, week: weekMap.get(k) || 0 })),
    total: { today: totToday, week: totWeek },
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

