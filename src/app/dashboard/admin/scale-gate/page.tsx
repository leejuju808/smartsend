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

type Tier = "locked" | "limited" | "unlocked" | string;

function tierRank(t: Tier) {
  if (t === "locked") return 1;
  if (t === "limited") return 2;
  return 3;
}

export default async function ScaleGateAdminPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const admin = supabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: companies }, { data: latest }, { data: subs }, { data: dl }] = await Promise.all([
    admin.from("roofing_companies").select("id,name,workspace_id,is_active").eq("is_active", true),
    admin.from("scale_metrics_latest").select("company_id,scale_score,tier,computed_at"),
    admin.from("company_subscriptions").select("company_id,status,plan,updated_at"),
    admin
      .from("delivery_logs")
      .select("company_id,status,created_at")
      .gte("created_at", since24h)
      .limit(50000),
  ]);

  const byCompany = new Map<string, any>();
  for (const c of companies || []) byCompany.set((c as any).id, { company: c });
  for (const m of latest || []) {
    const id = (m as any).company_id;
    byCompany.set(id, { ...(byCompany.get(id) || {}), metric: m });
  }
  for (const s of subs || []) {
    const id = (s as any).company_id;
    byCompany.set(id, { ...(byCompany.get(id) || {}), sub: s });
  }

  const agg24h = new Map<string, { sent: number; failed: number; dup: number }>();
  for (const r of dl || []) {
    const cid = String((r as any).company_id || "");
    if (!cid) continue;
    const cur = agg24h.get(cid) || { sent: 0, failed: 0, dup: 0 };
    const st = String((r as any).status || "");
    if (st === "sent") cur.sent += 1;
    if (st === "failed") cur.failed += 1;
    if (st === "duplicate_prevented") cur.dup += 1;
    agg24h.set(cid, cur);
  }

  const rows = Array.from(byCompany.entries()).map(([company_id, v]) => {
    const metric = v.metric || null;
    const tier = String(metric?.tier || "locked");
    const score = Number(metric?.scale_score ?? 0);
    const subStatus = String(v.sub?.status || "none");
    const a = agg24h.get(company_id) || { sent: 0, failed: 0, dup: 0 };
    const denom = a.sent + a.failed;
    const failRate = denom > 0 ? a.failed / denom : 0;
    return {
      company_id,
      company_name: String(v.company?.name || company_id.slice(0, 8)),
      tier,
      score,
      computed_at: metric?.computed_at || null,
      sub_status: subStatus,
      sent_24h: a.sent,
      failed_24h: a.failed,
      dup_24h: a.dup,
      fail_rate_24h: failRate,
    };
  });

  rows.sort((a, b) => {
    const tr = tierRank(a.tier) - tierRank(b.tier);
    if (tr !== 0) return tr;
    return a.score - b.score;
  });

  const countTier = (t: string) => rows.filter((r) => r.tier === t).length;

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scale Gate (v1)</h1>
        <p className="text-sm text-slate-600 mt-1">
          Internal-only. No overrides. Used to spot failure hot spots and validate safe scaling.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Metric title="Locked" value={String(countTier("locked"))} />
        <Metric title="Limited" value={String(countTier("limited"))} />
        <Metric title="Unlocked" value={String(countTier("unlocked"))} />
        <Metric title="Total" value={String(rows.length)} />
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Companies by tier</h2>
        <div className="mt-3 overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Tier</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-left">Subscription</th>
                <th className="px-3 py-2 text-right">Outreach 24h</th>
                <th className="px-3 py-2 text-right">Fail % (24h)</th>
                <th className="px-3 py-2 text-right">Dup (24h)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={7}>
                    No companies found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.company_id}>
                    <td className="px-3 py-2 font-medium">{r.company_name}</td>
                    <td className="px-3 py-2">
                      <TierPill tier={r.tier} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.score}</td>
                    <td className="px-3 py-2">{r.sub_status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sent_24h}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Math.round(r.fail_rate_24h * 1000) / 10}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.dup_24h}</td>
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

function TierPill(props: { tier: string }) {
  const t = props.tier;
  const cls =
    t === "unlocked"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : t === "limited"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{t}</span>;
}









