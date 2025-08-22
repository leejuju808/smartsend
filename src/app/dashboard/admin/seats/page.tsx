import 'server-only'
import { notFound } from 'next/navigation'
import { getUserSubscriptionStatus } from '@/lib/usage'
import { createServerComponentClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
}

export default async function SeatAuditPage() {
  const supabase = createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = (user as any)?.email as string | undefined
  if (!isAdminEmail(email)) notFound()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sb = admin()
  const { data } = await sb
    .from('seat_audits')
    .select('created_at, org_id, actor_id, type, delta, old_qty, new_qty')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)
  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Seat changes (30d)</h1>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Org</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Δ</th>
              <th className="px-3 py-2 text-left">Old → New</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data || []).map((r: any) => (
              <tr key={`${r.org_id}-${r.created_at}-${r.actor_id}`}>
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.org_id}</td>
                <td className="px-3 py-2">{r.actor_id}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                <td className="px-3 py-2">{r.old_qty} → {r.new_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

