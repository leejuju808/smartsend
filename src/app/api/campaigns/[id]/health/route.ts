import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

async function getAccountId(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  
  // Try to get account_id from user
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", data.user.id)
    .maybeSingle();
  
  return account?.id;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  try {
    const accountId = await getAccountId(supabase);
    const campaignId = params.id;

    // Get campaign health stats
    const { data: health, error: hErr } = await supabase
      .from("campaign_health_stats")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (hErr) {
      console.error("Error fetching health stats:", hErr);
      return NextResponse.json({ error: "Failed to fetch health stats" }, { status: 500 });
    }

    // If no health stats exist, compute them
    if (!health) {
      // Trigger health calculation
      const { error: calcErr } = await supabase.rpc("update_campaign_health_stats", {
        p_campaign_id: campaignId,
      });

      if (calcErr) {
        console.error("Error calculating health:", calcErr);
      }

      // Fetch again
      const { data: newHealth } = await supabase
        .from("campaign_health_stats")
        .select("*")
        .eq("campaign_id", campaignId)
        .maybeSingle();

      if (!newHealth) {
        return NextResponse.json({
          campaign_id: campaignId,
          emails_sent: 0,
          bounces_hard: 0,
          bounces_soft: 0,
          suppressed_sends: 0,
          send_errors: 0,
          opens: 0,
          replies: 0,
          health_score: 100.0,
        });
      }

      return NextResponse.json({
        campaign_id: newHealth.campaign_id,
        emails_sent: newHealth.emails_sent,
        bounces_hard: newHealth.bounces_hard,
        bounces_soft: newHealth.bounces_soft,
        suppressed_sends: newHealth.suppressed_sends,
        send_errors: newHealth.send_errors,
        opens: newHealth.opens,
        replies: newHealth.replies,
        health_score: parseFloat(newHealth.health_score.toString()),
      });
    }

    return NextResponse.json({
      campaign_id: health.campaign_id,
      emails_sent: health.emails_sent,
      bounces_hard: health.bounces_hard,
      bounces_soft: health.bounces_soft,
      suppressed_sends: health.suppressed_sends,
      send_errors: health.send_errors,
      opens: health.opens,
      replies: health.replies,
      health_score: parseFloat(health.health_score.toString()),
    });
  } catch (e: any) {
    const msg = e?.message === "Unauthorized" ? "Unauthorized" : "Server error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
























































