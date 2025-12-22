import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST supports pagination and filtering by event
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const campaignId: string | undefined = body.campaignId;
    const event: string | undefined = body.event;
    const page: number = Math.max(1, Number(body.page ?? 1));
    const pageSize: number = Math.min(200, Math.max(1, Number(body.pageSize ?? body.limit ?? 50)));
    if (!campaignId) throw new Error("campaignId required");

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabaseAdmin
      .from("campaign_logs")
      .select("*", { count: "exact" })
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (event && event !== "all") {
      q = q.eq("event", event);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
      page,
      pageSize,
      total: count ?? 0,
      totalPages: count ? Math.max(1, Math.ceil(count / pageSize)) : 1,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
  }
}
