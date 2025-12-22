import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const [sentRes, repliedRes, bouncedRes] = await Promise.all([
    supabase.from("send_logs").select("*", { count: "exact", head: true }).eq("campaign_id", params.campaignId),
    supabase
      .from("campaign_leads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", params.campaignId)
      .eq("status", "replied"),
    supabase.from("v_bounces").select("*", { count: "exact", head: true }).eq("campaign_id", params.campaignId),
  ]);

  const error = sentRes.error ?? repliedRes.error ?? bouncedRes.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    sent: sentRes.count ?? 0,
    replied: repliedRes.count ?? 0,
    bounced: bouncedRes.count ?? 0,
  });
}




