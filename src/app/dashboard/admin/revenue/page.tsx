import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'
import RevenueCharts from '@/components/admin/RevenueCharts'

type DayAgg = { day: string; revenue_cents: number; charges: number }

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

export default async function RevenuePage() {
  // Get current user server-side
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  const jar = cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return jar.get(name)?.value
      },
      set() {},
      remove() {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminEmail(user?.email)) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-600 mt-2">Your email is not in ADMIN_EMAILS.</p>
      </div>
    )
  }

  const sinceSec = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000)

  // Initialize day map for last 14 days
  const dayMap = new Map<string, DayAgg>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    dayMap.set(d, { day: d, revenue_cents: 0, charges: 0 })
  }

  // Page through charges in last 14 days
  let starting_after: string | undefined = undefined
  // Limit pages to avoid excessive runtime; 10 pages x 100 = 1000 charges max
  for (let page = 0; page < 10; page++) {
    const pageRes = await stripe.charges.list({
      created: { gte: sinceSec },
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
    })
    for (const ch of pageRes.data) {
      if (!ch.paid || ch.status !== 'succeeded') continue
      const day = new Date((ch.created || 0) * 1000).toISOString().slice(0, 10)
      const agg = dayMap.get(day)
      if (agg) {
        const amt = (ch.amount_captured ?? ch.amount ?? 0) || 0
        agg.revenue_cents += amt
        agg.charges += 1
      }
    }
    if (!pageRes.has_more || pageRes.data.length === 0) break
    starting_after = pageRes.data[pageRes.data.length - 1].id
  }

  const series = Array.from(dayMap.values())
  const total_cents = series.reduce((s, d) => s + d.revenue_cents, 0)
  const total_charges = series.reduce((s, d) => s + d.charges, 0)
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Revenue (14d)</h1>
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-sm text-slate-500">Gross revenue</div>
            <div className="text-2xl font-semibold">{fmt.format(total_cents / 100)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Succeeded charges</div>
            <div className="text-2xl font-semibold">{total_charges}</div>
          </div>
        </div>
        <div className="mt-6">
          {/* @ts-expect-error Server → Client */}
          <RevenueCharts series={series} />
        </div>
      </div>
    </div>
  )
}

