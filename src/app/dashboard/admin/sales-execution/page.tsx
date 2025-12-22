import 'server-only'

import { notFound } from 'next/navigation'
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server'
import { createSalesLead, bookDemo, startTrial } from './actions'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

function fmtPct(n: number) {
  return `${Math.round(n * 1000) / 10}%`
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function SalesExecutionAdminPage() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) notFound()

  const sb = supabaseAdmin()
  const { data: leads, error } = await sb
    .from('sales_leads')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  const all = leads || []
  const count = (s: string) => all.filter((l: any) => l.status === s).length
  const prospectsContacted = all.length
  const demosBooked = count('demo_booked')
  const trialsStarted = count('trial')
  const paidAccounts = count('paid')
  const conversion = prospectsContacted > 0 ? paidAccounts / prospectsContacted : 0

  const active = all.filter((l: any) => ['prospect', 'demo_booked', 'trial'].includes(l.status))

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Sales Execution (v1)</h1>
        <p className="text-sm text-slate-600 mt-1">Internal-only. No automations. Execution clarity only.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric title="Prospects Contacted" value={String(prospectsContacted)} />
        <Metric title="Demos Booked" value={String(demosBooked)} />
        <Metric title="Trials Started" value={String(trialsStarted)} />
        <Metric title="Paid Accounts" value={String(paidAccounts)} />
        <Metric title="Conversion %" value={fmtPct(conversion)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Active prospects</h2>
            <div className="mt-3 overflow-x-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Company</th>
                    <th className="px-3 py-2 text-left">Owner</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Last action</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {active.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={6}>No active prospects.</td>
                    </tr>
                  ) : (
                    active.map((l: any) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-medium">{l.company_name}</td>
                        <td className="px-3 py-2">{l.owner_name || '—'}</td>
                        <td className="px-3 py-2">{l.email || '—'}</td>
                        <td className="px-3 py-2">
                          <StatusPill status={l.status} />
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {new Date(l.updated_at || l.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {l.status === 'prospect' && (
                              <form action={bookDemo}>
                                <input type="hidden" name="id" value={l.id} />
                                <button className="px-3 py-1.5 rounded border bg-white hover:bg-slate-50">
                                  Book Demo
                                </button>
                              </form>
                            )}
                            {(l.status === 'prospect' || l.status === 'demo_booked') && (
                              <form action={startTrial}>
                                <input type="hidden" name="id" value={l.id} />
                                <button className="px-3 py-1.5 rounded border bg-black text-white hover:bg-black/90">
                                  Start Trial
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Add sales lead</h2>
            <form action={createSalesLead} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company name" name="company_name" required />
              <Field label="Owner name" name="owner_name" />
              <Field label="Email" name="email" type="email" />
              <Field label="Phone" name="phone" />
              <Field label="City" name="city" />
              <Field label="State" name="state" />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
                <select name="source" className="w-full rounded border px-3 py-2 bg-white">
                  <option value="cold_email">cold_email</option>
                  <option value="referral">referral</option>
                  <option value="inbound">inbound</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea name="notes" rows={3} className="w-full rounded border px-3 py-2 bg-white" />
              </div>
              <div className="sm:col-span-2 flex items-center justify-end">
                <button className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
                  Save lead
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">What You Say</h2>
            <div className="mt-3 rounded border bg-slate-50 p-3 text-sm text-slate-800 leading-relaxed">
              “We help roofers send estimates faster, follow up automatically, and prove ROI in one dashboard. If one job closes, it pays for itself.”
            </div>
            <p className="text-xs text-slate-500 mt-2">Locked (non-editable). Discipline enforced.</p>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">All leads</h2>
            <div className="mt-3 text-sm text-slate-600">
              {all.length} total • {paidAccounts} paid • {count('lost')} lost
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="text-2xl font-semibold mt-1">{props.value}</div>
    </div>
  )
}

function Field(props: { label: string; name: string; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {props.label}{props.required ? ' *' : ''}
      </label>
      <input
        name={props.name}
        type={props.type || 'text'}
        required={props.required}
        className="w-full rounded border px-3 py-2 bg-white"
      />
    </div>
  )
}

function StatusPill(props: { status: string }) {
  const s = props.status
  const cls =
    s === 'paid'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'trial'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : s === 'demo_booked'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : s === 'lost'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-slate-50 text-slate-700 border-slate-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{s}</span>
}









