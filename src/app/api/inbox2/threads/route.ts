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
    const campaignId = u.searchParams.get("campaignId"); // uuid | "all" | null
    const onlyStarred = u.searchParams.get("starred") === "1";
    const onlyOpen = u.searchParams.get("open") === "1"; // unresolved only
    const q = (u.searchParams.get("q") ?? "").trim();

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createClient(url, service, { auth: { persistSession: false } });

    let query = supabase
      .from("inbox_latest_by_lead")
      .select("*", { count: "exact" })
      .order("last_message_at", { ascending: false });

    if (campaignId && campaignId !== "all") query = query.eq("campaign_id", campaignId);
    if (onlyStarred) query = query.eq("starred", true);
    if (onlyOpen) query = query.eq("resolved", false);

    if (q) {
      query = query.or([
        `email.ilike.%${q}%`,
        `company.ilike.%${q}%`,
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `last_subject.ilike.%${q}%`,
        `last_body.ilike.%${q}%`
      ].join(","));
    }

    const { data, error, count } = await (query as any).range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      rows: data ?? [],
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load inbox" }, { status: 500 });
  }
}


