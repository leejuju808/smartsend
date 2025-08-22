import 'server-only'
import { notFound } from 'next/navigation'
import UsageHeatmap from '@/components/admin/UsageHeatmap'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

export default async function UsageHeatmapPage() {
  const supabase = createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email as string | undefined
  if (!isAdminEmail(email)) notFound()

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sb = createAdminClient()
  const { data } = await sb
    .from('usage_events')
    .select('created_at, kind, qty')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(20000)

  // Build list of last 30 days (YYYY-MM-DD)
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  }
  const kinds = Array.from(new Set((data || []).map((r: any) => r.kind))).sort()
  const matrix: Record<string, Record<string, number>> = {}
  for (const k of kinds) { matrix[k] = {}; for (const d of days) matrix[k][d] = 0 }
  for (const r of data || []) {
    const d = (r as any).created_at.slice(0, 10)
    const k = (r as any).kind as string
    if (matrix[k] && matrix[k][d] !== undefined) {
      matrix[k][d] += Number((r as any).qty ?? 0)
    }
  }
  // Flatten to cells for the client
  const cells = kinds.flatMap(kind => days.map(day => ({ kind, day, value: matrix[kind][day] })))
  const totals = kinds.map(kind => ({
    kind,
    total: days.reduce((s, d) => s + (matrix[kind][d] || 0), 0),
  })).sort((a, b) => b.total - a.total)

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Usage heatmap (last 30 days)</h1>
      <div className="rounded-xl border bg-white p-4">
        {/* @ts-expect-error Server→Client */}
        <UsageHeatmap days={days} kinds={kinds} cells={cells} />
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-600 mb-2">Top kinds (30d total)</h2>
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="px-3 py-2 text-left">Kind</th><th className="px-3 py-2 text-left">Total</th></tr>
              </thead>
              <tbody className="divide-y">
                {totals.map(t => (
                  <tr key={t.kind}>
                    <td className="px-3 py-2">{t.kind}</td>
                    <td className="px-3 py-2">{t.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
