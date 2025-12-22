import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Math.max(1, Number(u.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(10, Number(u.searchParams.get("pageSize") ?? "25")));
    const status = u.searchParams.get("status");
    const campaignId = u.searchParams.get("campaignId");
    const dateFrom = u.searchParams.get("dateFrom");
    const dateTo = u.searchParams.get("dateTo");
    const q = u.searchParams.get("q");

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createClient(url, service, { auth: { persistSession: false } });

    // Prefer the enriched view if present
    let query = supabase
      .from("send_queue_view")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

    if (campaignId && campaignId !== "all") query = query.eq("campaign_id", campaignId);
    if (status && status !== "all") query = query.eq("status", status);

    if (dateFrom) query = query.gte("updated_at", `${dateFrom}T00:00:00.000Z`);
    if (dateTo) query = query.lte("updated_at", `${dateTo}T23:59:59.999Z`);

    if (q && q.trim()) {
      // Fallback-safe OR filter on common enriched fields
      query = query.or(`email.ilike.%${q}%,company.ilike.%${q}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({ rows: data ?? [], page, pageSize, total, totalPages });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "List failed" }, { status: 500 });
  }
}


