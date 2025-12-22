import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const u = new URL(req.url);
  const campaign = u.searchParams.get("campaign");
  if (!campaign) {
    return NextResponse.json({ error: "campaign parameter required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("v_campaign_step_funnel")
    .select("*")
    .eq("campaign_id", campaign)
    .order("step_no", { ascending: true });

  if (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  // compute rates
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    open_rate: r.sent ? Math.round((r.opens / r.sent) * 100) : 0,
    click_rate: r.sent ? Math.round((r.clicks / r.sent) * 100) : 0,
    reply_rate: r.sent ? Math.round((r.replies / r.sent) * 100) : 0,
    book_rate: r.sent ? Math.round((r.booked / r.sent) * 100) : 0,
  }));

  return NextResponse.json({ rows }, { headers: { "content-type": "application/json" } });
}

