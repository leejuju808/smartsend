import "server-only";

import { notFound } from "next/navigation";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

type HealthStatus = "healthy" | "at_risk" | "critical" | string;

function statusRank(s: HealthStatus) {
  if (s === "critical") return 1;
  if (s === "at_risk") return 2;
  return 3;
}

function pillClasses(s: string) {
  if (s === "critical") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "at_risk") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function safeKeyReason(reasons: any): string {
  const arr = reasons?.reasons;
  if (Array.isArray(arr) && arr.length > 0) return String(arr[0]?.label || "—");
  return "—";
}

function safeLastActivity(reasons: any): string {
  const v = reasons?.signals?.last_activity_at;
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toISOString();
  } catch {
    return String(v);
  }
}

export default async function PerformanceMonitorAdminPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const admin = supabaseAdmin();

  const [{ data: companies }, { data: healthRows }, { data: subs }, { data: trendToday }] =
    await Promise.all([
      admin.from("roofing_companies").select("id,name,is_active").eq("is_active", true).limit(5000),
      admin.from("performance_health_latest").select("company_id,status,reasons,computed_at").limit(5000),
      admin.from("company_subscriptions").select("company_id,status,plan,updated_at").limit(5000),
      admin.from("performance_health_trend_daily").select("*").eq("day", new Date().toISOString().slice(0, 10)).maybeSingle(),
    ]);

  const byCompany = new Map<string, any>();
  for (const c of companies || []) byCompany.set(String((c as any).id), { company: c });
  for (const h of healthRows || []) {
    const cid = String((h as any).company_id);
    byCompany.set(cid, { ...(byCompany.get(cid) || {}), health: h });
  }
  for (const s of subs || []) {
    const cid = String((s as any).company_id);
    byCompany.set(cid, { ...(byCompany.get(cid) || {}), sub: s });
  }

  const rows = Array.from(byCompany.entries()).map(([company_id, v]) => {
    const companyName = String(v.company?.name || company_id.slice(0, 8));
    const status = String(v.health?.status || "healthy");
    const reasons = v.health?.reasons || {};
    const subscriptionStatus = String(v.sub?.status || "none");
    const watchClosely = !!reasons?.flags?.watch_closely;
    return {
      company_id,
      company_name: companyName,
      status,
      key_reason: safeKeyReason(reasons),
      last_activity_at: safeLastActivity(reasons),
      subscription_status: subscriptionStatus,
      computed_at: v.health?.computed_at || null,
      watch_closely: watchClosely,
    };
  });

  rows.sort((a, b) => {
    const sr = statusRank(a.status) - statusRank(b.status);
    if (sr !== 0) return sr;
    return a.company_name.localeCompare(b.company_name);
  });

  const criticalCount = rows.filter((r) => r.status === "critical").length;
  const atRiskCount = rows.filter((r) => r.status === "at_risk").length;
  const healthyCount = rows.filter((r) => r.status === "healthy").length;
  const total = rows.length;

  const trend = (trendToday as any) || null;
  const pctHealthy = trend?.healthy_pct ?? (total ? Math.round((healthyCount / total) * 1000) / 10 : 0);
  const pctAtRisk = trend?.at_risk_pct ?? (total ? Math.round((atRiskCount / total) * 1000) / 10 : 0);
  const pctCritical = trend?.critical_pct ?? (total ? Math.round((criticalCount / total) * 1000) / 10 : 0);

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Silent Performance Monitor (v1)</h1>
        <p className="text-sm text-slate-600 mt-1">
          Internal-only. Users never see this unless something is wrong.
        </p>
      </div>

      {criticalCount > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
          <div className="font-semibold">Immediate attention needed</div>
          <div className="text-sm mt-0.5">{criticalCount} companies are in Critical.</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Metric title="% Healthy" value={`${pctHealthy}%`} />
        <Metric title="% At Risk" value={`${pctAtRisk}%`} />
        <Metric title="% Critical" value={`${pctCritical}%`} />
        <Metric title="Total companies" value={String(total)} />
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Companies</h2>
        <div className="mt-3 overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Health Status</th>
                <th className="px-3 py-2 text-left">Key Risk Reason</th>
                <th className="px-3 py-2 text-left">Last Activity</th>
                <th className="px-3 py-2 text-left">Subscription</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={5}>
                    No companies found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.company_id}>
                    <td className="px-3 py-2 font-medium">
                      {r.company_name}
                      {r.watch_closely ? (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded border text-xs bg-slate-50 text-slate-700 border-slate-200">
                          watch closely
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${pillClasses(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.key_reason}</td>
                    <td className="px-3 py-2 text-slate-700">{r.last_activity_at}</td>
                    <td className="px-3 py-2">{r.subscription_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="text-2xl font-semibold mt-1">{props.value}</div>
    </div>
  );
}









