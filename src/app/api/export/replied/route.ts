import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const campaignId = u.searchParams.get("campaignId");
    const dateFrom = u.searchParams.get("dateFrom");
    const dateTo = u.searchParams.get("dateTo");
    const q = (u.searchParams.get("q") ?? "").trim();
    const limit = Math.min(100000, Math.max(1000, Number(u.searchParams.get("limit") ?? "50000")));

    const sb = createClient(url, service, { auth: { persistSession: false } });

    let base = sb
      .from("leads")
      .select("id,campaign_id,email,first_name,last_name,company,created_at,updated_at", { count: "exact", head: false })
      .eq("status", "replied")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (campaignId && campaignId !== "all") base = base.eq("campaign_id", campaignId);
    if (dateFrom) base = base.gte("updated_at", `${dateFrom}T00:00:00.000Z`);
    if (dateTo) base = base.lte("updated_at", `${dateTo}T23:59:59.999Z`);
    if (q) {
      base = base.or([
        `email.ilike.%${q}%`,
        `company.ilike.%${q}%`,
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`
      ].join(","));
    }

    const { data, error } = await base;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (data ?? []).map(r => r.id);
    let latestByLead: Record<string, { subject: string | null; body: string | null; created_at: string | null }> = {};
    if (ids.length) {
      const { data: inbound } = await sb.rpc("get_latest_inbound_for_leads", { p_lead_ids: ids }).catch(() => ({ data: null as any }));
      if (inbound && Array.isArray(inbound)) {
        latestByLead = Object.fromEntries(
          inbound.map((r: any) => [r.lead_id, { subject: r.subject ?? null, body: r.body ?? null, created_at: r.created_at ?? null }])
        );
      }
    }

    const headers = [
      "lead_id", "campaign_id", "email", "first_name", "last_name", "company",
      "replied_at", "created_at", "updated_at",
      "last_subject", "last_snippet"
    ];

    const lines: string[] = [headers.join(",")];
    for (const r of (data ?? [])) {
      const latest = latestByLead[r.id] ?? { subject: null, body: null, created_at: null };
      const row = [
        r.id,
        r.campaign_id,
        r.email,
        r.first_name ?? "",
        r.last_name ?? "",
        r.company ?? "",
        latest.created_at ?? r.updated_at ?? "",
        r.created_at ?? "",
        r.updated_at ?? "",
        latest.subject ?? "",
        (latest.body ?? "").replace(/\s+/g, " ").slice(0, 240)
      ].map(csvSafe);
      lines.push(row.join(","));
    }

    const csv = lines.join("\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="replied_leads_${Date.now()}.csv"`
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Export failed" }, { status: 500 });
  }
}

function csvSafe(v: string) {
  const s = String(v ?? "");
  const needs = /[",\n]/.test(s);
  const esc = s.replace(/"/g, '""');
  return needs ? `"${esc}"` : esc;
}


