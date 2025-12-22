import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer } from "@/lib/acl";

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? 30);
  const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 30, 7), 365);
  const sinceDate = new Date(Date.now() - days * 86400000);
  const sinceIso = sinceDate.toISOString().slice(0, 10);

  const [kpisRes, repsRes, dailyRes] = await Promise.all([
    supabase.from("v_campaign_meeting_kpis").select("*").eq("campaign_id", params.campaignId).maybeSingle(),
    supabase.from("v_campaign_meeting_kpis_by_rep").select("*").eq("campaign_id", params.campaignId),
    supabase
      .from("v_campaign_booked_daily")
      .select("*")
      .eq("campaign_id", params.campaignId)
      .gte("d_utc", sinceIso)
      .order("d_utc", { ascending: true }),
  ]);

  const error = kpisRes.error ?? repsRes.error ?? dailyRes.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    kpis: kpisRes.data ?? null,
    reps: repsRes.data ?? [],
    daily: dailyRes.data ?? [],
  });
}



