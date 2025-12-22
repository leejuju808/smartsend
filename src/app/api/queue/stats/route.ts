import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  const supabase = getServerSupabase();

  try {
    const accountId = gate.workspace_id; // Using workspace_id as account_id

    // Get pending count
    const { count: pending } = await supabase
      .from("global_send_queue")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "pending");

    // Get processing count
    const { count: processing } = await supabase
      .from("global_send_queue")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "processing");

    // Get sent today count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from("global_send_queue")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "sent")
      .gte("sent_at", todayStart.toISOString());

    // Get failed count (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { count: failed } = await supabase
      .from("global_send_queue")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "failed")
      .gte("updated_at", yesterday.toISOString());

    // Get reputation score
    const { data: reputationData } = await supabase
      .from("deliverability_stats")
      .select("reputation_score")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const reputation = reputationData?.reputation_score ?? 100;

    // Determine back-pressure status
    let backPressureStatus = "normal";
    let backPressureThrottle = 1.0;
    if (reputation < 50) {
      backPressureStatus = "critical";
      backPressureThrottle = 0;
    } else if (reputation < 60) {
      backPressureStatus = "severe";
      backPressureThrottle = 0.25;
    } else if (reputation < 70) {
      backPressureStatus = "warning";
      backPressureThrottle = 0.5;
    }

    return NextResponse.json({
      pending: pending ?? 0,
      processing: processing ?? 0,
      sentToday: sentToday ?? 0,
      failed: failed ?? 0,
      reputation,
      backPressureStatus,
      backPressureThrottle,
    });
  } catch (error) {
    console.error("Queue stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch queue stats" },
      { status: 500 }
    );
  }
}












