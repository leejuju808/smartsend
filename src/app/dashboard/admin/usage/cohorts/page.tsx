import 'server-only'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getUserWithSubscription } from '@/lib/getUserWithSubscription'
import CohortChart from '@/components/admin/CohortChart'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}
function isProLike(s?: string | null) {
  return s === 'pro' || s === 'active' || s === 'trialing' || s === 'past_due'
}

export default async function CohortsPage() {
  const { user } = await getUserWithSubscription()
  const email = (user as any)?.email as string | undefined
  if (!isAdminEmail(email)) notFound()
  const sb = admin()
  const since = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000) // ~8 weeks
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, email, created_at, subscription_status')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(10000)
  const ids = (profiles || []).map((p: any) => p.id)
  const { data: usages } = await sb
    .from('usage_events')
    .select('user_id, qty, created_at')
    .in('user_id', ids)
    .order('created_at', { ascending: true })
    .limit(50000)

  // Bucket by signup week
  type Coh = { week: string; users: number; pro: number; avg7d: number }
  const map = new Map<string, Coh>()
  for (const p of profiles || []) {
    const created = new Date((p as any).created_at)
    const wkStart = new Date(created); wkStart.setDate(wkStart.getDate() - wkStart.getDay()) // Sunday week start
    const key = wkStart.toISOString().slice(0,10)
    if (!map.has(key)) map.set(key, { week: key, users: 0, pro: 0, avg7d: 0 })
    const row = map.get(key)!
    row.users += 1
    if (isProLike((p as any).subscription_status)) row.pro += 1
  }
  // Compute per-user 7d usage then aggregate avg per cohort
  const byUser: Record<string, { created: Date; usage7d: number; cohort: string }> = {}
  for (const p of profiles || []) {
    const created = new Date((p as any).created_at)
    const wkStart = new Date(created); wkStart.setDate(wkStart.getDate() - wkStart.getDay())
    byUser[(p as any).id] = { created, usage7d: 0, cohort: wkStart.toISOString().slice(0,10) }
  }
  for (const u of usages || []) {
    const uid = (u as any).user_id as string
    const info = byUser[uid]; if (!info) continue
    const t = new Date((u as any).created_at)
    if (t.getTime() - info.created.getTime() <= 7 * 24 * 60 * 60 * 1000) {
      info.usage7d += Number((u as any).qty ?? 0)
    }
  }
  for (const uid in byUser) {
    const { cohort, usage7d } = byUser[uid]
    const row = map.get(cohort); if (!row) continue
    row.avg7d += usage7d
  }
  for (const row of map.values()) {
    row.avg7d = row.users ? Math.round((row.avg7d / row.users) * 10) / 10 : 0
  }
  const rows = Array.from(map.values()).sort((a,b) => a.week.localeCompare(b.week))

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Cohorts: usage → conversion (8 weeks)</h1>
      <div className="rounded-xl border bg-white p-4">
        {/* @ts-expect-error Server→Client */}
        <CohortChart rows={rows} />
        <div className="mt-6 overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Signup week</th>
                <th className="px-3 py-2 text-left">Users</th>
                <th className="px-3 py-2 text-left">Pro %</th>
                <th className="px-3 py-2 text-left">Avg 7-day usage</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.week}>
                  <td className="px-3 py-2">{r.week}</td>
                  <td className="px-3 py-2">{r.users}</td>
                  <td className="px-3 py-2">{r.users ? Math.round((r.pro / r.users) * 1000) / 10 : 0}%</td>
                  <td className="px-3 py-2">{r.avg7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
