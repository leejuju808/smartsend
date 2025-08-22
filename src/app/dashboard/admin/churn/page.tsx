import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import ChurnCharts from '@/components/admin/ChurnCharts'

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

type DayAgg = { day: string; canceled: number; saved: number }

export default async function ChurnPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  const jar = cookies()
  const { createServerClient } = await import('@supabase/ssr')
  const sb = createServerClient(url, anon, {
    cookies: {
      get(n: string) { return jar.get(n)?.value },
      set() {},
      remove() {},
    },
  })
  const { data: { user } } = await sb.auth.getUser()
  const email = user?.email
  if (!isAdminEmail(email)) {
    notFound()
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const adm = admin()

  // Load churn intents (reasons)
  const { data: intents } = await adm
    .from('churn_intents')
    .select('created_at, reason, offer_applied')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000)

  // Load analytics events for hard cancels & saves (webhook + offer)
  const { data: events } = await adm
    .from('analytics_events')
    .select('created_at,name')
    .gte('created_at', since)
    .in('name', ['subscription_canceled','save_offer_applied'])
    .order('created_at', { ascending: true })
    .limit(5000)

  // Day skeleton
  const dayMap = new Map<string, DayAgg>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dayMap.set(d, { day: d, canceled: 0, saved: 0 })
  }

  // Fill from events
  for (const e of events || []) {
    const day = (e as any).created_at.slice(0, 10)
    const agg = dayMap.get(day)
    if (!agg) continue
    if ((e as any).name === 'subscription_canceled') agg.canceled++
    if ((e as any).name === 'save_offer_applied') agg.saved++
  }

  // Reason histogram
  const reasonMap = new Map<string, number>()
  for (const i of intents || []) {
    const r = ((i as any).reason || 'unspecified') as string
    reasonMap.set(r, (reasonMap.get(r) || 0) + 1)
  }
  const reasons = Array.from(reasonMap.entries()).map(([name, value]) => ({ name, value }))
  const series = Array.from(dayMap.values())
  const totals = series.reduce((a, d) => ({ canceled: a.canceled + d.canceled, saved: a.saved + d.saved }), { canceled: 0, saved: 0 })

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Churn</h1>
      <div className="rounded-xl border bg-white p-4 space-y-6">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-sm text-slate-500">Canceled (30d)</div>
            <div className="text-2xl font-semibold">{totals.canceled}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Saves (30d)</div>
            <div className="text-2xl font-semibold">{totals.saved}</div>
          </div>
        </div>
        {/* @ts-expect-error Server→Client */}
        <ChurnCharts series={series} reasons={reasons} />
      </div>
    </div>
  )
}

import 'server-only'
import { notFound } from 'next/navigation'
import { getUserSubscriptionStatus } from '@/lib/usage'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'
import ChurnCharts from '@/components/admin/ChurnCharts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

type DayAgg = { day: string; canceled: number; saved: number }

export default async function ChurnPage() {
  const { user } = await getUserSubscriptionStatus()
  const supabase = createServerComponentClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const email = authUser?.email as string | undefined
  if (!isAdminEmail(email)) {
    notFound()
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sb = createAdminClient()

  // Load churn intents (reasons)
  const { data: intents } = await sb
    .from('churn_intents')
    .select('created_at, reason, offer_applied')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000)

  // Load analytics events for hard cancels & saves (webhook + offer)
  const { data: events } = await sb
    .from('analytics_events')
    .select('created_at,name')
    .gte('created_at', since)
    .in('name', ['subscription_canceled','save_offer_applied'])
    .order('created_at', { ascending: true })
    .limit(5000)

  // Day skeleton
  const dayMap = new Map<string, DayAgg>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dayMap.set(d, { day: d, canceled: 0, saved: 0 })
  }

  // Fill from events
  for (const e of events || []) {
    const day = (e as any).created_at.slice(0, 10)
    const agg = dayMap.get(day)
    if (!agg) continue
    if ((e as any).name === 'subscription_canceled') agg.canceled++
    if ((e as any).name === 'save_offer_applied') agg.saved++
  }

  // Reason histogram
  const reasonMap = new Map<string, number>()
  for (const i of intents || []) {
    const r = ((i as any).reason || 'unspecified') as string
    reasonMap.set(r, (reasonMap.get(r) || 0) + 1)
  }
  const reasons = Array.from(reasonMap.entries()).map(([name, value]) => ({ name, value }))
  const series = Array.from(dayMap.values())
  const totals = series.reduce((a, d) => ({ canceled: a.canceled + d.canceled, saved: a.saved + d.saved }), { canceled: 0, saved: 0 })

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Churn</h1>
      <div className="rounded-xl border bg-white p-4 space-y-6">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-sm text-slate-500">Canceled (30d)</div>
            <div className="text-2xl font-semibold">{totals.canceled}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Saves (30d)</div>
            <div className="text-2xl font-semibold">{totals.saved}</div>
          </div>
        </div>
        {/* @ts-expect-error Server→Client */}
        <ChurnCharts series={series} reasons={reasons} />
      </div>
    </div>
  )
}
