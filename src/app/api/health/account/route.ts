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

export async function GET(_: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  try {
    const accountId = await getAccountId(supabase);

    if (!accountId) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Get account health score
    const { data: account, error: aErr } = await supabase
      .from("accounts")
      .select("health_score, last_health_update")
      .eq("id", accountId)
      .single();

    if (aErr) {
      console.error("Error fetching account:", aErr);
      return NextResponse.json({ error: "Failed to fetch account health" }, { status: 500 });
    }

    // Get aggregated campaign stats
    const { data: campaignStats, error: cErr } = await supabase
      .from("campaign_health_stats")
      .select("emails_sent, bounces_hard, bounces_soft, suppressed_sends, send_errors, replies")
      .eq("account_id", accountId)
      .gte("last_updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (cErr) {
      console.error("Error fetching campaign stats:", cErr);
    }

    // Aggregate totals
    const totals = (campaignStats || []).reduce(
      (acc, stat) => ({
        emails_sent: acc.emails_sent + (stat.emails_sent || 0),
        bounces_hard: acc.bounces_hard + (stat.bounces_hard || 0),
        bounces_soft: acc.bounces_soft + (stat.bounces_soft || 0),
        suppressed_sends: acc.suppressed_sends + (stat.suppressed_sends || 0),
        send_errors: acc.send_errors + (stat.send_errors || 0),
        replies: acc.replies + (stat.replies || 0),
      }),
      {
        emails_sent: 0,
        bounces_hard: 0,
        bounces_soft: 0,
        suppressed_sends: 0,
        send_errors: 0,
        replies: 0,
      }
    );

    // Update account health score if needed
    if (account?.health_score === null || account?.last_health_update === null) {
      await supabase.rpc("update_account_health_score", {
        p_account_id: accountId,
      });

      // Fetch updated account
      const { data: updatedAccount } = await supabase
        .from("accounts")
        .select("health_score")
        .eq("id", accountId)
        .single();

      return NextResponse.json({
        account_id: accountId,
        health_score: parseFloat((updatedAccount?.health_score || 100.0).toString()),
        last_30_days: totals,
      });
    }

    return NextResponse.json({
      account_id: accountId,
      health_score: parseFloat((account?.health_score || 100.0).toString()),
      last_30_days: totals,
    });
  } catch (e: any) {
    const msg = e?.message === "Unauthorized" ? "Unauthorized" : "Server error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
























































