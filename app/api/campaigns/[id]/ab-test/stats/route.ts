import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campaignId = params.id;
  const { searchParams } = new URL(req.url);
  const stepId = searchParams.get("step_id");
  const stepNo = searchParams.get("step_no");

  if (!stepId && !stepNo) {
    return NextResponse.json(
      { error: "step_id or step_no required" },
      { status: 400 }
    );
  }

  const supabase = createClient();

  try {
    // Get stats from send_queue
    let query = supabase
      .from("send_queue")
      .select("ab_variant, status")
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "completed", "dispatched", "Done"]);

    if (stepNo) {
      query = query.eq("step_no", parseInt(stepNo));
    }

    const { data: queueStats } = await query;

    if (!queueStats || queueStats.length === 0) {
      return NextResponse.json({
        step_id: stepId || "",
        step_no: stepNo ? parseInt(stepNo) : 0,
        variant_a: { sent: 0, opened: 0, rate: 0 },
        variant_b: { sent: 0, opened: 0, rate: 0 },
        winner: null,
        improvement_pct: null,
      });
    }

    const variantA = queueStats.filter((m: any) => m.ab_variant === "A");
    const variantB = queueStats.filter((m: any) => m.ab_variant === "B");

    const sentA = variantA.length;
    const sentB = variantB.length;

    // Get open counts from email_events or email_messages
    let openedA = 0;
    let openedB = 0;

    if (stepId) {
      // Try email_messages
      const { data: messagesA } = await supabase
        .from("email_messages")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("step_id", stepId)
        .eq("ab_variant", "A");

      const { data: messagesB } = await supabase
        .from("email_messages")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("step_id", stepId)
        .eq("ab_variant", "B");

      if (messagesA && messagesA.length > 0) {
        const messageIdsA = messagesA.map((m: any) => m.id);
        const { count } = await supabase
          .from("email_events")
          .select("*", { count: "exact", head: true })
          .in("message_id", messageIdsA)
          .eq("type", "open");
        openedA = count || 0;
      }

      if (messagesB && messagesB.length > 0) {
        const messageIdsB = messagesB.map((m: any) => m.id);
        const { count } = await supabase
          .from("email_events")
          .select("*", { count: "exact", head: true })
          .in("message_id", messageIdsB)
          .eq("type", "open");
        openedB = count || 0;
      }
    }

    const rateA = sentA > 0 ? (openedA / sentA) * 100 : 0;
    const rateB = sentB > 0 ? (openedB / sentB) * 100 : 0;

    // Get winner from step
    let winner: string | null = null;
    if (stepId) {
      const { data: step } = await supabase
        .from("smartsend_sequence_steps")
        .select("ab_test_winner")
        .eq("id", stepId)
        .maybeSingle();
      winner = step?.ab_test_winner || null;
    } else if (stepNo) {
      const { data: step } = await supabase
        .from("campaign_steps")
        .select("ab_test_winner")
        .eq("campaign_id", campaignId)
        .eq("step_no", parseInt(stepNo))
        .maybeSingle();
      winner = step?.ab_test_winner || null;
    }

    const improvementPct =
      winner === "A" && rateB > 0
        ? ((rateA - rateB) / rateB) * 100
        : winner === "B" && rateA > 0
        ? ((rateB - rateA) / rateA) * 100
        : null;

    return NextResponse.json({
      step_id: stepId || "",
      step_no: stepNo ? parseInt(stepNo) : 0,
      variant_a: {
        sent: sentA,
        opened: openedA,
        rate: rateA,
      },
      variant_b: {
        sent: sentB,
        opened: openedB,
        rate: rateB,
      },
      winner,
      improvement_pct: improvementPct,
    });
  } catch (error: any) {
    console.error("A/B test stats error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}



























































