import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape((r as any)[h])).join(","));
  }
  return lines.join("\n");
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  // Resolve company (prefer membership, fallback to first company in workspace)
  const { data: membership } = await supabase
    .from("roofing_company_members")
    .select("roofing_company_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const companyId =
    (membership?.roofing_company_id as string | undefined) ??
    (
      await supabase
        .from("roofing_companies")
        .select("id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    ).data?.id;

  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const { data: estimates } = await supabase
    .from("estimates")
    .select("id, customer_name, address, scope, scope_summary, total_price, status, created_at, approved_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, estimate_id, customer_name, address, scope_summary, scheduled_date, status, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const est = estimates ?? [];
  const approved = est.filter((e: any) => e.status === "approved");
  const revenueTotal = approved.reduce((sum: number, e: any) => sum + (Number(e.total_price) || 0), 0);

  const revenueSummary = [
    {
      company_id: companyId,
      exported_at: new Date().toISOString(),
      estimates_total: est.length,
      estimates_approved: approved.length,
      revenue_total_approved_estimates: revenueTotal,
      jobs_total: (jobs ?? []).length,
    },
  ];

  // Return as a multi-file payload (client downloads 3 CSVs)
  return NextResponse.json({
    ok: true,
    files: [
      { name: `smartsend_estimates_${companyId}.csv`, csv: toCsv(est.map((r: any) => ({ ...r }))) },
      { name: `smartsend_jobs_${companyId}.csv`, csv: toCsv((jobs ?? []).map((r: any) => ({ ...r }))) },
      { name: `smartsend_revenue_summary_${companyId}.csv`, csv: toCsv(revenueSummary) },
    ],
  });
}










