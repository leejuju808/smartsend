import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(5, parseInt(url.searchParams.get("perPage") || "20", 10)));
    const campaignId = url.searchParams.get("campaignId") || undefined;
    const search = url.searchParams.get("search") || undefined;

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let base = supabase.from("leads").select("*", { count: "exact" });

    if (campaignId) base = base.eq("campaign_id", campaignId);
    if (status && status !== "all") base = base.eq("status", status);
    if (search) base = base.ilike("email", `%${search}%`);

    // newest first
    base = base.order("updated_at", { ascending: false }).range(from, to);

    const { data, count, error } = await base;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      leads: data ?? [],
      page,
      perPage,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / perPage)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
