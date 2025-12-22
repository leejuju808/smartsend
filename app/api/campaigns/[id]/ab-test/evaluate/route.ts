import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const campaignId = params.id;
  const supabase = createClient();

  try {
    // 1) Fetch steps with A/B enabled from campaign_steps
    const { data: campaignSteps } = await supabase
      .from("campaign_steps")
      .select("id, step_no, ab_test_enabled, ab_test_winner, subject_variant_a, subject_variant_b")
      .eq("campaign_id", campaignId)
      .eq("ab_test_enabled", true);

    // Also check smartsend_sequence_steps
    const { data: sequenceSteps } = await supabase
      .from("smartsend_sequence_steps")
      .select("id, position, ab_test_enabled, ab_test_winner, subject_variant_a, subject_variant_b")
      .eq("campaign_id", campaignId)
      .eq("ab_test_enabled", true);

    const allSteps = [
      ...(campaignSteps || []).map(s => ({ ...s, step_no: s.step_no, isSequence: false })),
      ...(sequenceSteps || []).map(s => ({ ...s, step_no: s.position, isSequence: true }))
    ];

    const results = [];

    for (const step of allSteps) {
      // Get stats from send_queue (which tracks ab_variant)
      const { data: queueStats } = await supabase
        .from("send_queue")
        .select("ab_variant, status")
        .eq("campaign_id", campaignId)
        .eq("step_no", step.step_no)
        .in("status", ["sent", "completed", "dispatched"]);

      if (!queueStats || queueStats.length === 0) continue;

      const variantA = queueStats.filter((m: any) => m.ab_variant === "A");
      const variantB = queueStats.filter((m: any) => m.ab_variant === "B");

      const sentA = variantA.length;
      const sentB = variantB.length;

      if (sentA + sentB < 100) {
        results.push({
          step_id: step.id,
          step_no: step.step_no,
          status: "insufficient_data",
          sent_a: sentA,
          sent_b: sentB,
          message: "Need at least 100 total sends to determine winner"
        });
        continue;
      }

      // Get open counts from email_events or email_messages
      // Try email_messages first
      let openedA = 0;
      let openedB = 0;

      // Check email_messages table
      const { data: messagesA } = await supabase
        .from("email_messages")
        .select("id, opened_at")
        .eq("campaign_id", campaignId)
        .eq("step_id", step.id)
        .eq("ab_variant", "A");

      const { data: messagesB } = await supabase
        .from("email_messages")
        .select("id, opened_at")
        .eq("campaign_id", campaignId)
        .eq("step_id", step.id)
        .eq("ab_variant", "B");

      if (messagesA) {
        openedA = messagesA.filter((m: any) => m.opened_at).length;
      }

      if (messagesB) {
        openedB = messagesB.filter((m: any) => m.opened_at).length;
      }

      // Also check email_events for opens
      if (messagesA && messagesA.length > 0) {
        const messageIdsA = messagesA.map((m: any) => m.id);
        const { count: opensA } = await supabase
          .from("email_events")
          .select("*", { count: "exact", head: true })
          .in("message_id", messageIdsA)
          .eq("type", "open");
        if (opensA) openedA = opensA;
      }

      if (messagesB && messagesB.length > 0) {
        const messageIdsB = messagesB.map((m: any) => m.id);
        const { count: opensB } = await supabase
          .from("email_events")
          .select("*", { count: "exact", head: true })
          .in("message_id", messageIdsB)
          .eq("type", "open");
        if (opensB) openedB = opensB;
      }

      const rateA = sentA > 0 ? (openedA / sentA) * 100 : 0;
      const rateB = sentB > 0 ? (openedB / sentB) * 100 : 0;

      const winner = rateA >= rateB ? "A" : "B";

      // Update the step with the winner
      const tableName = step.isSequence ? "smartsend_sequence_steps" : "campaign_steps";
      await supabase
        .from(tableName)
        .update({ ab_test_winner: winner })
        .eq("id", step.id);

      results.push({
        step_id: step.id,
        step_no: step.step_no,
        status: "winner_determined",
        winner,
        sent_a: sentA,
        sent_b: sentB,
        opened_a: openedA,
        opened_b: openedB,
        rate_a: Math.round(rateA * 100) / 100,
        rate_b: Math.round(rateB * 100) / 100,
        improvement_pct: winner === "A" 
          ? (rateB > 0 ? Math.round(((rateA - rateB) / rateB) * 100 * 100) / 100 : rateA)
          : (rateA > 0 ? Math.round(((rateB - rateA) / rateA) * 100 * 100) / 100 : rateB)
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    console.error("A/B test evaluation error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}



























































