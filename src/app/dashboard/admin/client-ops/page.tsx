import 'server-only'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

function HealthPill(props: { status: string }) {
  const s = (props.status || 'yellow').toLowerCase()
  const cls =
    s === 'green'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'red'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-amber-50 text-amber-800 border-amber-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{s}</span>
}

function StatusPill(props: { status: string }) {
  const s = (props.status || 'not_started').toLowerCase()
  const cls =
    s === 'complete'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'active'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-slate-50 text-slate-700 border-slate-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{s}</span>
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ClientOpsAdminPage() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) notFound()

  const sb = supabaseAdmin()
  const { data: ops, error } = await sb
    .from('client_ops')
    .select(
      `
      company_id,
      onboarding_status,
      first_estimate_sent_at,
      first_job_approved_at,
      founder,
      health_status,
      last_checkin_at,
      created_at,
      roofing_companies:roofing_companies (
        id,
        name,
        city,
        state,
        workspace_id,
        created_at,
        company_subscriptions(status, plan),
        company_sending_state(paused, paused_reason, last_error_at)
      )
    `
    )
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)

  const rows = (ops || []).map((r: any) => {
    const company = r.roofing_companies || {}
    const sub = company.company_subscriptions || null
    const sendState = company.company_sending_state || null
    const subscription = Array.isArray(sub) ? sub[0] : sub
    const sending = Array.isArray(sendState) ? sendState[0] : sendState
    return {
      company_id: r.company_id,
      company_name: company.name,
      location: [company.city, company.state].filter(Boolean).join(', '),
      health_status: r.health_status,
      onboarding_status: r.onboarding_status,
      founder: !!r.founder,
      subscription_status: subscription?.status || 'none',
      subscription_plan: subscription?.plan || null,
      sending_paused: !!sending?.paused,
      last_checkin_at: r.last_checkin_at,
      first_estimate_sent_at: r.first_estimate_sent_at,
      first_job_approved_at: r.first_job_approved_at,
    }
  })

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client Ops (First 10) — v1</h1>
        <p className="text-sm text-slate-600 mt-1">Internal-only. Visibility + manual control. No automations.</p>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Client</th>
              <th className="px-4 py-2 text-left">Health</th>
              <th className="px-4 py-2 text-left">Onboarding</th>
              <th className="px-4 py-2 text-left">Subscription</th>
              <th className="px-4 py-2 text-left">Sending</th>
              <th className="px-4 py-2 text-left">Last check-in</th>
              <th className="px-4 py-2 text-right">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={7}>
                  No tracked clients yet. (A row is created automatically when a roofing company is created; you can
                  toggle “founder” in the client detail page.)
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.company_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      <span>{r.company_name || r.company_id}</span>
                      {r.founder ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-purple-50 text-purple-700 border-purple-200">
                          founder
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{r.location || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <HealthPill status={r.health_status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.onboarding_status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{r.subscription_status}</div>
                    <div className="text-xs text-slate-500">{r.subscription_plan || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.sending_paused ? (
                      <span className="text-rose-700 text-xs font-semibold">paused</span>
                    ) : (
                      <span className="text-emerald-700 text-xs font-semibold">ok</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.last_checkin_at ? new Date(r.last_checkin_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="inline-flex items-center px-3 py-1.5 rounded border bg-white hover:bg-slate-50"
                      href={`/dashboard/admin/client-ops/${r.company_id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}









