import 'server-only'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server'
import {
  createStarterCheckoutLink,
  markCompanyPaid,
  markCompanyUnpaid,
  pauseAccount,
  recordCheckIn,
  resumeAccount,
  setFounderFlag,
} from '../actions'

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

function ChecklistRow(props: { label: string; done: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center ${
          props.done ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
        }`}
      >
        {props.done ? <div className="h-2 w-2 rounded-sm bg-white" /> : null}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-900">{props.label}</div>
        {props.detail ? <div className="text-xs text-slate-500 mt-0.5">{props.detail}</div> : null}
      </div>
    </div>
  )
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function isWithinDays(iso: string | null, days: number) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= daysAgo(days).getTime()
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ClientOpsCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params

  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) notFound()

  const sb = supabaseAdmin()

  const [{ data: ops }, { data: company }, { data: sub }, { data: sendState }] = await Promise.all([
    sb
      .from('client_ops')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle(),
    sb
      .from('roofing_companies')
      .select('id, name, owner_id, workspace_id, phone_number, address, city, state, website, created_at')
      .eq('id', companyId)
      .maybeSingle(),
    sb
      .from('company_subscriptions')
      .select('status, plan, updated_at, created_at')
      .eq('company_id', companyId)
      .maybeSingle(),
    sb
      .from('company_sending_state')
      .select('paused, paused_reason, manual_resume_required, last_error, last_error_at, updated_at')
      .eq('company_id', companyId)
      .maybeSingle(),
  ])

  if (!company) notFound()

  // If ops row missing (older data), create a default view model
  const opsRow: any = ops || {
    company_id: companyId,
    onboarding_status: 'not_started',
    health_status: 'yellow',
    founder: false,
    first_estimate_sent_at: null,
    first_job_approved_at: null,
    last_checkin_at: null,
    notes: null,
  }

  const [
    estimatesCountRes,
    estimatesSentCountRes,
    estimatesApprovedRes,
    followupsActiveRes,
    activityRes,
    healthDailyRes,
    deliveryLogs24hRes,
    outreachSentAllTimeRes,
    inboxRepliesAllTimeRes,
    hotWarmLeadsRes,
    estimateRequestMessagesRes,
  ] = await Promise.all([
    sb.from('estimates').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    sb
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('sent_at', 'is', null),
    sb
      .from('estimates')
      .select('total, approved_at')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(200),
    sb
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('followup_status', 'active'),
    company.workspace_id
      ? sb
          .from('workspace_activity')
          .select('id, type, subtype, created_at, metadata')
          .eq('workspace_id', company.workspace_id)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] } as any),
    sb
      .from('client_ops_health_daily')
      .select('day, health_status')
      .eq('company_id', companyId)
      .order('day', { ascending: false })
      .limit(7),
    sb
      .from('delivery_logs')
      .select('status, created_at, error_message')
      .eq('company_id', companyId)
      .gte('created_at', daysAgo(1).toISOString())
      .order('created_at', { ascending: false })
      .limit(200),
    // BLOCK 267200 — Conversion stats (lifetime)
    sb
      .from('delivery_logs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('message_type', 'outreach')
      .eq('status', 'sent'),
    company.workspace_id
      ? sb
          .from('inbox_messages')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', company.workspace_id)
          .eq('direction', 'inbound')
      : Promise.resolve({ count: 0 } as any),
    sb
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('roofing_company_id', companyId)
      .in('heat_score', ['hot', 'warm']),
    company.workspace_id
      ? sb
          .from('inbox_messages')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', company.workspace_id)
          .eq('direction', 'inbound')
          .in('intent', ['booking_request', 'estimate_request', 'inspection_request', 'schedule_request'])
      : Promise.resolve({ count: 0 } as any),
  ])

  const estimatesCount = (estimatesCountRes as any).count || 0
  const estimatesSentCount = (estimatesSentCountRes as any).count || 0
  const approvedRows = (estimatesApprovedRes.data as any[]) || []
  const approvedCount = approvedRows.length
  const approvedRevenue = approvedRows.reduce((sum, r) => sum + (Number(r.total) || 0), 0)
  const followupsActive = ((followupsActiveRes as any).count || 0) > 0

  const activityRows = (activityRes.data as any[]) || []
  const dashboardViewed7d = activityRows.some((a) => new Date(a.created_at).getTime() >= daysAgo(7).getTime())

  const healthDaily = (healthDailyRes.data as any[]) || []
  const yellowStreak5 =
    healthDaily.length >= 5 &&
    healthDaily.slice(0, 5).every((d) => String(d.health_status).toLowerCase() === 'yellow')
  const checkInNeeded = String(opsRow.health_status).toLowerCase() === 'yellow' && yellowStreak5

  const companyInfoCompleted = !!(company.name && company.phone_number && company.address && company.city && company.state)
  const subscriptionActive = (sub?.status || '') === 'active'

  const checklist = {
    accountCreated: true,
    companyInfoCompleted,
    firstEstimateCreated: estimatesCount > 0,
    firstEstimateSent: estimatesSentCount > 0 || !!opsRow.first_estimate_sent_at,
    followupsActive,
    dashboardViewed: dashboardViewed7d,
    subscriptionActive,
  }

  const showFirstValueBanner =
    isWithinDays(opsRow.first_estimate_sent_at || null, 3) || isWithinDays(opsRow.first_job_approved_at || null, 3)

  const sendingPaused = !!sendState?.paused
  const deliveryRows = (deliveryLogs24hRes.data as any[]) || []
  const deliverySent24h = deliveryRows.filter((d) => d.status === 'sent').length
  const deliveryFailed24h = deliveryRows.filter((d) => d.status === 'failed').length
  const deliveryBlocked24h = deliveryRows.filter((d) => d.status === 'blocked').length
  const lastDeliveryFailure = deliveryRows.find((d) => d.status === 'failed') || null

  // BLOCK 267200 — hard numbers
  const outreachSentAllTime = (outreachSentAllTimeRes as any).count || 0
  const repliesAllTime = (inboxRepliesAllTimeRes as any).count || 0
  const hotWarmLeads = (hotWarmLeadsRes as any).count || 0
  const estimateRequests = (estimateRequestMessagesRes as any).count || 0
  const block267200Ready = outreachSentAllTime >= 175 && repliesAllTime >= 10 && hotWarmLeads >= 5

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link className="hover:underline" href="/dashboard/admin/client-ops">
              Client Ops
            </Link>{' '}
            / {company.name}
          </div>
          <h1 className="text-2xl font-semibold mt-1">{company.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <HealthPill status={opsRow.health_status} />
            <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-slate-50 text-slate-700 border-slate-200">
              onboarding: {opsRow.onboarding_status}
            </span>
            {opsRow.founder ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-purple-50 text-purple-700 border-purple-200">
                founder
              </span>
            ) : null}
            {checkInNeeded ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs bg-amber-50 text-amber-800 border-amber-200">
                check-in needed (yellow 5d)
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sendingPaused ? (
            <form action={resumeAccount}>
              <input type="hidden" name="company_id" value={companyId} />
              <button className="px-3 py-2 rounded border bg-emerald-600 text-white hover:bg-emerald-700">
                Resume account
              </button>
            </form>
          ) : (
            <form action={pauseAccount}>
              <input type="hidden" name="company_id" value={companyId} />
              <input type="hidden" name="reason" value="manual_admin_pause" />
              <button className="px-3 py-2 rounded border bg-rose-600 text-white hover:bg-rose-700">Pause account</button>
            </form>
          )}
        </div>
      </div>

      {showFirstValueBanner ? (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
          <div className="text-sm font-semibold text-amber-900">First value achieved.</div>
          <div className="text-sm text-amber-900/80 mt-1">This is your retention moment.</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Onboarding checklist (admin-only)</h2>
              <div className="text-xs text-slate-500">Auto-tracked</div>
            </div>
            <div className="mt-4 divide-y">
              <ChecklistRow label="Account created" done={checklist.accountCreated} />
              <ChecklistRow
                label="Company info completed"
                done={checklist.companyInfoCompleted}
                detail="Requires name + phone + address + city + state"
              />
              <ChecklistRow label="First estimate created" done={checklist.firstEstimateCreated} detail={`${estimatesCount} total`} />
              <ChecklistRow label="First estimate sent" done={checklist.firstEstimateSent} detail={`${estimatesSentCount} sent`} />
              <ChecklistRow label="Follow-ups active" done={checklist.followupsActive} />
              <ChecklistRow label="Dashboard viewed (last 7 days)" done={checklist.dashboardViewed} />
              <ChecklistRow
                label="Subscription active"
                done={checklist.subscriptionActive}
                detail={sub ? `${sub.status}${sub.plan ? ` • ${sub.plan}` : ''}` : 'none'}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Revenue metrics</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric title="Estimates created" value={String(estimatesCount)} />
              <Metric title="Approved jobs" value={String(approvedCount)} />
              <Metric title="Approved revenue" value={`$${Math.round(approvedRevenue).toLocaleString()}`} />
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Recent activity</h2>
            <div className="mt-3 space-y-2">
              {activityRows.length === 0 ? (
                <div className="text-sm text-slate-500">No recent activity found.</div>
              ) : (
                activityRows.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="text-slate-800">
                      <span className="font-medium">{a.type}</span>
                      {a.subtype ? <span className="text-slate-500"> / {a.subtype}</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Subscription status</h2>
            <div className="mt-2 text-sm text-slate-800">{sub ? sub.status : 'none'}</div>
            <div className="text-xs text-slate-500 mt-1">{sub?.plan ? `plan: ${sub.plan}` : '—'}</div>
            {sub?.status === 'active' ? (
              <div className="text-xs text-slate-500 mt-1">
                {sub?.updated_at ? `updated: ${new Date(sub.updated_at).toLocaleString()}` : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Conversion moment (BLOCK 267200)</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Outreach emails sent</span>
                <span className="font-semibold text-slate-900">{outreachSentAllTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Replies received</span>
                <span className="font-semibold text-slate-900">{repliesAllTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Hot/Warm leads</span>
                <span className="font-semibold text-slate-900">{hotWarmLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Estimate requests (intent)</span>
                <span className="font-semibold text-slate-900">{estimateRequests}</span>
              </div>
            </div>

            {!block267200Ready ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <div className="font-semibold">BLOCK STOP</div>
                <div className="mt-1 text-rose-800/80">
                  Required to proceed: ≥175 sent, ≥10 replies, ≥5 hot/warm.
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <div className="font-semibold">Ready to charge.</div>
                <div className="mt-1 text-emerald-900/80">Generate the Stripe link and send it immediately.</div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <form action={createStarterCheckoutLink}>
                <input type="hidden" name="company_id" value={companyId} />
                <button
                  className="w-full px-3 py-2 rounded bg-black text-white hover:bg-black/90 disabled:opacity-50"
                  disabled={!block267200Ready}
                >
                  Create Stripe Starter checkout link ($99/mo)
                </button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                <form action={markCompanyPaid}>
                  <input type="hidden" name="company_id" value={companyId} />
                  <button className="w-full px-3 py-2 rounded border bg-white hover:bg-slate-50">
                    Mark paid + unlock
                  </button>
                </form>
                <form action={markCompanyUnpaid}>
                  <input type="hidden" name="company_id" value={companyId} />
                  <button className="w-full px-3 py-2 rounded border bg-white hover:bg-slate-50">
                    Mark unpaid
                  </button>
                </form>
              </div>

              <div className="text-[11px] text-slate-500">
                Stripe link is written into <span className="font-mono">client_ops.notes</span>.
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Sending status</h2>
            <div className="mt-2 text-sm text-slate-800">{sendingPaused ? 'paused' : 'ok'}</div>
            {sendState?.paused_reason ? <div className="text-xs text-slate-500 mt-1">{sendState.paused_reason}</div> : null}
            {sendState?.last_error ? <div className="text-xs text-rose-700 mt-2">{sendState.last_error}</div> : null}
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Delivery logs (last 24h)</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniMetric title="sent" value={String(deliverySent24h)} tone="ok" />
              <MiniMetric title="failed" value={String(deliveryFailed24h)} tone={deliveryFailed24h > 0 ? 'bad' : 'ok'} />
              <MiniMetric title="blocked" value={String(deliveryBlocked24h)} tone={deliveryBlocked24h > 0 ? 'warn' : 'ok'} />
            </div>
            {lastDeliveryFailure ? (
              <div className="mt-3 text-xs text-rose-700">
                Last failure: {new Date(lastDeliveryFailure.created_at).toLocaleString()}
                {lastDeliveryFailure.error_message ? ` — ${lastDeliveryFailure.error_message}` : ''}
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-500">No failures in last 24h.</div>
            )}
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Manual check-in</h2>
            <div className="text-xs text-slate-500 mt-1">No emails. Just record that a check-in was done.</div>
            <form action={recordCheckIn} className="mt-3 space-y-2">
              <input type="hidden" name="company_id" value={companyId} />
              <textarea
                name="note"
                rows={4}
                className="w-full rounded border px-3 py-2 text-sm bg-white"
                placeholder="Optional note (what you asked / what they said / next action)"
              />
              <button className="w-full px-3 py-2 rounded bg-black text-white hover:bg-black/90">Record check-in</button>
              <div className="text-xs text-slate-500">
                Last check-in: {opsRow.last_checkin_at ? new Date(opsRow.last_checkin_at).toLocaleString() : '—'}
              </div>
            </form>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Founder safety</h2>
            <div className="text-xs text-slate-500 mt-1">Founder clients get daily internal snapshots.</div>
            <form action={setFounderFlag} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="company_id" value={companyId} />
              <input type="hidden" name="founder" value={opsRow.founder ? 'false' : 'true'} />
              <button className="flex-1 px-3 py-2 rounded border bg-white hover:bg-slate-50">
                {opsRow.founder ? 'Unset founder' : 'Mark as founder'}
              </button>
            </form>
          </div>

          {opsRow.notes ? (
            <div className="rounded-xl border bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">Notes</h2>
              <pre className="mt-3 text-xs whitespace-pre-wrap text-slate-700">{opsRow.notes}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="text-lg font-semibold text-slate-900 mt-1">{props.value}</div>
    </div>
  )
}

function MiniMetric(props: { title: string; value: string; tone: 'ok' | 'warn' | 'bad' }) {
  const cls =
    props.tone === 'bad'
      ? 'bg-rose-50 border-rose-200 text-rose-700'
      : props.tone === 'warn'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{props.title}</div>
      <div className="text-sm font-semibold">{props.value}</div>
    </div>
  )
}









