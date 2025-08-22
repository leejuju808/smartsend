import 'server-only'
import { notFound } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import { getUserWithSubscription } from '@/lib/getUserWithSubscription'
import MrrMovementChart from '@/components/admin/MrrMovementChart'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

function mrrFromSub(sub: any): number {
  if (!sub?.items?.data) return 0
  let cents = 0
  for (const it of sub.items.data) {
    const price = it.price || it.plan
    const unit = price?.unit_amount ?? 0
    const qty = it.quantity ?? 1
    const interval = price?.recurring?.interval || price?.interval
    if (!unit || !interval) continue
    const monthly = interval === 'year' ? Math.round((unit * qty) / 12) : interval === 'month' ? unit * qty : 0
    cents += monthly
  }
  return cents
}

export default async function MrrMovementPage() {
  const { user } = await getUserWithSubscription()
  const email = (user as any)?.email as string | undefined
  if (!isAdminEmail(email)) notFound()
  const sinceSec = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)

  let newC = 0, churnC = 0, expansionC = 0, contractionC = 0
  let newN = 0, churnN = 0, expansionN = 0, contractionN = 0

  // New
  for await (const ev of (stripe.events.list({ type: 'customer.subscription.created', created: { gte: sinceSec }, limit: 100 }) as any)) {
    const sub = (ev as any).data?.object
    const m = mrrFromSub(sub)
    if (m > 0) { newC += m; newN++ }
  }

  // Churn
  for await (const ev of (stripe.events.list({ type: 'customer.subscription.deleted', created: { gte: sinceSec }, limit: 100 }) as any)) {
    const sub = (ev as any).data?.object
    const m = mrrFromSub(sub)
    if (m > 0) { churnC += m; churnN++ }
  }

  // Expansion/Contraction (best-effort; only when we can infer previous items)
  for await (const ev of (stripe.events.list({ type: 'customer.subscription.updated', created: { gte: sinceSec }, limit: 100 }) as any)) {
    const cur = (ev as any).data?.object
    const prev = (ev as any).data?.previous_attributes
    if (!prev) continue
    const curM = mrrFromSub(cur)
    // Try previous via previous_attributes.items (partial)
    let prevM = 0
    const prevItems = (prev as any).items?.data || (prev as any).items || null
    if (Array.isArray(prevItems)) {
      for (const it of prevItems) {
        const price = it.price || it.plan
        const unit = price?.unit_amount ?? 0
        const qty = it.quantity ?? 1
        const interval = price?.recurring?.interval || price?.interval
        if (!unit || !interval) continue
        const monthly = interval === 'year' ? Math.round((unit * qty) / 12) : interval === 'month' ? unit * qty : 0
        prevM += monthly
      }
    } else {
      continue
    }
    const delta = curM - prevM
    if (delta > 0) { expansionC += delta; expansionN++ }
    if (delta < 0) { contractionC += Math.abs(delta); contractionN++ }
  }

  const rows = [
    { kind: 'New', amount: Math.round(newC / 100), count: newN },
    { kind: 'Expansion', amount: Math.round(expansionC / 100), count: expansionN },
    { kind: 'Contraction', amount: Math.round(contractionC / 100), count: contractionN },
    { kind: 'Churn', amount: Math.round(churnC / 100), count: churnN },
  ]

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">MRR movement (last 30 days)</h1>
      <div className="rounded-xl border bg-white p-4">
        {/* @ts-expect-error Server→Client */}
        <MrrMovementChart rows={rows} />
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Amount (USD MRR)</th>
                <th className="px-3 py-2 text-left">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.kind}>
                  <td className="px-3 py-2">{r.kind}</td>
                  <td className="px-3 py-2">${r.amount.toLocaleString()}</td>
                  <td className="px-3 py-2">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
