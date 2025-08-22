import 'server-only'
import { notFound } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import { createServerComponentClient } from '@/lib/supabase'
import MrrCharts from '@/components/admin/MrrCharts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

type DayRev = { day: string; revenue_cents: number; charges: number }

export default async function MrrPage() {
  const supabase = createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email as string | undefined
  if (!isAdminEmail(email)) notFound()

  // Current MRR snapshot
  let currentMrrCents = 0
  const mrrByCustomer: Array<{ customer: string; email?: string | null; mrr_cents: number }> = []
  const iter = await stripe.subscriptions.list({ status: 'active', limit: 100 })
  for (const sub of iter.data) {
    let subMrr = 0
    for (const it of sub.items.data) {
      const price = it.price
      const amt = price?.unit_amount ?? 0
      const qty = it.quantity ?? 1
      const interval = price?.recurring?.interval
      if (!amt || !interval) continue
      const monthly = interval === 'year' ? Math.round((amt * qty) / 12) : interval === 'month' ? amt * qty : 0
      subMrr += monthly
    }
    currentMrrCents += subMrr
    const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
    mrrByCustomer.push({ customer: custId || sub.id, email: (sub as any).customer_email ?? null, mrr_cents: subMrr })
  }
  mrrByCustomer.sort((a, b) => b.mrr_cents - a.mrr_cents)

  // 60d daily gross revenue
  const sinceSec = Math.floor((Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000)
  const dayMap = new Map<string, DayRev>()
  for (let i = 59; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dayMap.set(d, { day: d, revenue_cents: 0, charges: 0 })
  }
  const charges = await stripe.charges.list({ created: { gte: sinceSec }, limit: 100 })
  for (const ch of charges.data) {
    if (!ch.paid || ch.status !== 'succeeded') continue
    const day = new Date(ch.created * 1000).toISOString().slice(0, 10)
    const agg = dayMap.get(day)
    if (agg) {
      agg.revenue_cents += (ch.amount_captured ?? ch.amount ?? 0)
      agg.charges += 1
    }
  }
  const series = Array.from(dayMap.values())

  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
  const arr = currentMrrCents * 12

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">MRR / ARR</h1>
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-8">
          <div>
            <div className="text-sm text-slate-500">Current MRR</div>
            <div className="text-2xl font-semibold">{fmt.format(currentMrrCents / 100)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">ARR (MRR × 12)</div>
            <div className="text-2xl font-semibold">{fmt.format(arr / 100)}</div>
          </div>
        </div>
        <div className="mt-6">
          {/* @ts-expect-error Server→Client */}
          <MrrCharts series={series} />
        </div>
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-600 mb-2">Top customers by MRR</h2>
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mrrByCustomer.slice(0, 15).map((c) => (
                  <tr key={c.customer}>
                    <td className="px-3 py-2">{c.customer}</td>
                    <td className="px-3 py-2">{c.email ?? '—'}</td>
                    <td className="px-3 py-2">{fmt.format(c.mrr_cents / 100)}</td>
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

