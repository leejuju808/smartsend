import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { Upgrade99Button } from "@/components/billing/Upgrade99Button";

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n || 0);
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

function Metric(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-xs font-medium text-slate-500">{props.label}</div>
      <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
        {props.value}
      </div>
      {props.sub ? (
        <div className="mt-1 text-xs text-slate-500">{props.sub}</div>
      ) : null}
    </div>
  );
}

export default async function RevenueWeaponPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) redirect("/welcome");

  const res = await fetch("/api/revenue-weapon", { cache: "no-store" }).catch(
    () => null
  );

  // Server-to-server fetch can be flaky in some deployments; fall back to direct DB reads.
  const fallback = async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const sinceIso = today.toISOString();

    const [{ count: replies }, { count: hot }, { count: warm }, { count: dead }] =
      await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .gte("last_reply_at", sinceIso),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("outreach_status", "hot"),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("outreach_status", "warm"),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("outreach_status", "dead"),
      ]);

    const hotLeads = hot ?? 0;
    const warmLeads = warm ?? 0;
    return {
      period: { since: sinceIso },
      emailsSent: 0,
      replies: replies ?? 0,
      hotLeads,
      warmLeads,
      deadLeads: dead ?? 0,
      jobsInConversation: hotLeads + warmLeads,
      estimatedJobValue: hotLeads * 10_000 + warmLeads * 5_000,
      assumptions: { hotValue: 10_000, warmValue: 5_000 },
    };
  };

  const data = res && res.ok ? await res.json() : await fallback();

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
          <p className="text-xs text-slate-500">
            Today only. No fluff.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/campaigns"
            className="rounded-xl border px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
          >
            Campaigns
          </Link>
          <Upgrade99Button className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-70" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="Emails Sent" value={String(data.emailsSent ?? 0)} />
        <Metric label="Replies" value={String(data.replies ?? 0)} />
        <Metric
          label="Jobs in Conversation"
          value={String(data.jobsInConversation ?? 0)}
          sub="Hot + Warm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric
          label="Hot Leads"
          value={String(data.hotLeads ?? 0)}
          sub={`$${data.assumptions?.hotValue ?? 10000}/job`}
        />
        <Metric
          label="Warm Leads"
          value={String(data.warmLeads ?? 0)}
          sub={`$${data.assumptions?.warmValue ?? 5000}/job`}
        />
        <Metric label="Dead Leads" value={String(data.deadLeads ?? 0)} />
      </div>

      <div className="rounded-2xl border bg-slate-900 p-6 text-white">
        <div className="text-xs font-semibold text-slate-300">
          Estimated Job Value
        </div>
        <div className="mt-2 text-5xl font-extrabold tracking-tight">
          {formatMoney(data.estimatedJobValue ?? 0)}
        </div>
        <div className="mt-2 text-xs text-slate-300">
          Hot = {formatMoney(data.assumptions?.hotValue ?? 10000)} • Warm ={" "}
          {formatMoney(data.assumptions?.warmValue ?? 5000)}
        </div>
        <div className="mt-4">
          <Upgrade99Button className="inline-flex rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-70" label="Increase daily sending (Upgrade)" />
        </div>
      </div>
    </div>
  );
}








