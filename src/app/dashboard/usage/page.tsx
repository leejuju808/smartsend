import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'
import Link from 'next/link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function UsagePage() {
  const u = createServerComponentClient()
  const {
    data: { user },
  } = await u.auth.getUser()
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-slate-600 mt-2">Please <a className="underline" href="/login">sign in</a> to view your usage.</p>
      </div>
    )
  }
  const sb = createAdminClient()
  const startDay = new Date(); startDay.setHours(0, 0, 0, 0)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const { data: rows } = await sb
    .from('usage_events')
    .select('created_at, kind, qty')
    .eq('user_id', user.id)
    .gte('created_at', since7d.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000)

  const todayMap = new Map<string, number>()
  const weekMap = new Map<string, number>()
  for (const r of rows || []) {
    const k = (r as any).kind as string
    const rawQty = (r as any).qty
    const q = Number(rawQty == null ? 0 : rawQty)
    const t = new Date((r as any).created_at)
    weekMap.set(k, (weekMap.get(k) || 0) + q)
    if (t >= startDay) todayMap.set(k, (todayMap.get(k) || 0) + q)
  }
  const kinds = Array.from(new Set((rows || []).map((r: any) => r.kind))).sort()

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your usage</h1>
        <div className="flex items-center gap-2">
          <a className="rounded-lg border px-3 py-2 text-sm" href="/api/usage/export?range=today">Export today (CSV)</a>
          <a className="rounded-lg border px-3 py-2 text-sm" href="/api/usage/export?range=7d">Export 7d (CSV)</a>
          <a className="rounded-lg border px-3 py-2 text-sm" href="/api/usage/export?range=30d">Export 30d (CSV)</a>
        </div>
      </div>
      <div className="rounded-2xl border bg-white p-4">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Today</th>
              <th className="px-3 py-2 text-left">Last 7 days</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {kinds.map(k => (
              <tr key={k}>
                <td className="px-3 py-2">{k}</td>
                <td className="px-3 py-2">{todayMap.get(k) || 0}</td>
                <td className="px-3 py-2">{weekMap.get(k) || 0}</td>
              </tr>
            ))}
            {kinds.length === 0 ? (
              <tr><td className="px-3 py-2" colSpan={3}>No usage yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-600">Recent events</h2>
          <Link href="/dashboard/billing" className="text-xs underline">Upgrade</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(rows || []).slice(0, 50).map((r: any, i: number) => (
                <tr key={`${r.created_at}-${i}`}>
                  <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.kind}</td>
                  <td className="px-3 py-2">{r.qty}</td>
                </tr>
              ))}
              {(rows || []).length === 0 ? (
                <tr><td className="px-3 py-2" colSpan={3}>No recent usage.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

