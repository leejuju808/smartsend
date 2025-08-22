import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ExperimentsVariantChart from '@/components/admin/ExperimentsVariantChart'
import { getUserWithSubscription } from '@/lib/getUserWithSubscription'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

type Row = { name: string; created_at: string; context: any }

export default async function ExperimentsPage() {
  const { user } = await getUserWithSubscription()
  const email = (user as any)?.email as string | undefined
  if (!isAdminEmail(email)) notFound()

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sb = admin()
  const { data, error } = await sb
    .from('analytics_events')
    .select('name, created_at, context')
    .gte('created_at', since)
    .in('name', ['checkout_started', 'subscription_activated'])
    .order('created_at', { ascending: true })
    .limit(20000)
  if (error) throw new Error('Failed to load analytics')

  const byVariant = new Map<string, { started:number; activated:number }>()
  for (const r of (data as Row[])) {
    const v = (r.context?.variant ?? 'unknown') as string
    if (!byVariant.has(v)) byVariant.set(v, { started:0, activated:0 })
    const agg = byVariant.get(v)!
    if (r.name === 'checkout_started') agg.started++
    if (r.name === 'subscription_activated') agg.activated++
  }
  const rows = Array.from(byVariant.entries()).map(([variant, v]) => {
    const conv = v.started ? Math.round((v.activated / v.started) * 1000) / 10 : 0
    return { variant, ...v, conv }
  }).sort((a,b) => (b.conv - a.conv))

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Price experiment (last 30d)</h1>
      <div className="rounded-xl border bg-white p-4">
        {/* @ts-expect-error Server→Client */}
        <ExperimentsVariantChart rows={rows} />
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Variant</th>
                <th className="px-3 py-2 text-left">Checkouts</th>
                <th className="px-3 py-2 text-left">Activations</th>
                <th className="px-3 py-2 text-left">Conv%</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.variant}>
                  <td className="px-3 py-2">{r.variant}</td>
                  <td className="px-3 py-2">{r.started}</td>
                  <td className="px-3 py-2">{r.activated}</td>
                  <td className="px-3 py-2">{r.conv}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

