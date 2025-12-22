import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const workspace_id = u.user.id;
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  const dailyQuery = supabase
    .from("v_email_metrics_daily_merged")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("day", { ascending: true });

  const domainQuery = supabase
    .from("v_email_domain_stats")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("delivered", { ascending: false })
    .limit(20);

  if (campaignId) {
    dailyQuery.eq("campaign_id", campaignId);
    domainQuery.eq("campaign_id", campaignId);
  } else {
    dailyQuery.is("campaign_id", null);
    domainQuery.is("campaign_id", null);
  }

  const [{ data: daily, error: dErr }, { data: domains, error: domErr }] =
    await Promise.all([dailyQuery, domainQuery]);

  if (dErr || domErr) {
    return NextResponse.json({ ok: false, error: dErr?.message || domErr?.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, daily, domains });
}