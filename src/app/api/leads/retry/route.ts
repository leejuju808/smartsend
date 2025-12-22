import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Back-compat: accept either { ids } or new shape { lead_ids | leadIds, campaign_id | campaignId, max_attempts | maxAttempts }
    const ids: string[] | undefined = body?.ids || body?.lead_ids || body?.leadIds;
    const campaignId: string | undefined = body?.campaign_id || body?.campaignId;
    const maxAttempts: number | undefined = body?.max_attempts ?? body?.maxAttempts;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "leadIds/ids[] required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization") || "",
          },
        },
      }
    );

    // Prefer newer RPC signature when campaignId provided
    const { data, error } = campaignId
      ? await supabase.rpc("retry_failed_leads", { p_campaign_id: campaignId, p_lead_ids: ids, p_max_attempts: maxAttempts ?? 3 })
      : await supabase.rpc("retry_failed_leads", { lead_ids: ids });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const updatedIds = (data ?? []).map((r: any) => r.lead_id ?? r.id);
    const attempted = ids.length;
    const updated = updatedIds.length;
    const skipped = Math.max(0, attempted - updated);

    return NextResponse.json({ updated, skipped, updatedIds });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
