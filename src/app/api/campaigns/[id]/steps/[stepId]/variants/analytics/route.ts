import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/campaigns/[id]/steps/[stepId]/variants/analytics
// Returns A/B test metrics: sent, replies, hot leads, reply rate, hot rate per variant
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify step exists and belongs to campaign
    const { data: step, error: stepError } = await supabase
      .from("campaign_steps")
      .select("id, step_no, campaign_id, has_variants, enable_variant")
      .eq("id", params.stepId)
      .eq("campaign_id", params.id)
      .single();

    if (stepError || !step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    // Block 11600: Check enable_variant (new system) or has_variants (legacy)
    if (!step.enable_variant && !step.has_variants) {
      return NextResponse.json({ 
        variants: [],
        message: "A/B variants not enabled for this step" 
      });
    }

    // Block 11600: Use new variant stats view if available
    const { data: variantStats } = await supabase
      .from("campaign_step_variant_stats")
      .select("*")
      .eq("campaign_id", params.id)
      .eq("step_no", step.step_no);

    let variantMetrics: any[] = [];

    if (variantStats && variantStats.length > 0) {
      // Use the new variant stats view
      variantMetrics = variantStats.map((stat) => {
        const deliveries = stat.deliveries || 0;
        const replies = stat.replies || 0;
        const hotLeads = stat.hot_leads || 0;
        const warmLeads = stat.warm_leads || 0;
        const replyRate = deliveries > 0 ? (replies / deliveries) * 100 : 0;
        const hotRate = deliveries > 0 ? (hotLeads / deliveries) * 100 : 0;

        return {
          variant_key: stat.variant_used,
          sent: deliveries,
          replies: replies,
          hot: hotLeads,
          warm: warmLeads,
          reply_rate: Number(replyRate.toFixed(2)),
          hot_rate: Number(hotRate.toFixed(2))
        };
      });
    } else {
      // Fallback: Query send_queue directly (Block 11600)
      variantMetrics = await Promise.all(['A', 'B'].map(async (variantUsed) => {
        // Count sent messages for this variant from send_queue
        const { count: sentCount } = await supabase
          .from("send_queue")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", params.id)
          .eq("step_no", step.step_no)
          .eq("variant_used", variantUsed)
          .in("status", ["sent", "completed", "dispatched"]);

        const sentNum = (sentCount || 0) as number;

        // Count replies - check normalized_messages linked to send_queue items
        const { data: sentItems } = await supabase
          .from("send_queue")
          .select("thread_id, id")
          .eq("campaign_id", params.id)
          .eq("step_no", step.step_no)
          .eq("variant_used", variantUsed)
          .in("status", ["sent", "completed", "dispatched"])
          .not("thread_id", "is", null);

        const threadIds = sentItems?.map(item => item.thread_id).filter(Boolean) || [];
        
        let repliesNum = 0;
        let hotNum = 0;
        
        if (threadIds.length > 0) {
          const { count: repliesCount } = await supabase
            .from("normalized_messages")
            .select("*", { count: "exact", head: true })
            .in("linked_thread_id", threadIds)
            .eq("direction", "inbound");

          repliesNum = (repliesCount || 0) as number;

          // Count hot leads - check leads table for hot status
          const { data: replies } = await supabase
            .from("normalized_messages")
            .select("from_email")
            .in("linked_thread_id", threadIds)
            .eq("direction", "inbound");

          if (replies && replies.length > 0) {
            const replyEmails = [...new Set(replies.map(r => r.from_email))];
            const { count: hotCount } = await supabase
              .from("leads")
              .select("*", { count: "exact", head: true })
              .in("email", replyEmails)
              .eq("status", "hot");

            hotNum = (hotCount || 0) as number;
          }
        }
        
        const replyRate = sentNum > 0 ? (repliesNum / sentNum) * 100 : 0;
        const hotRate = sentNum > 0 ? (hotNum / sentNum) * 100 : 0;

        return {
          variant_key: variantUsed,
          sent: sentNum,
          replies: repliesNum,
          hot: hotNum,
          reply_rate: Number(replyRate.toFixed(2)),
          hot_rate: Number(hotRate.toFixed(2))
        };
      }));
    }

    // Block 11600: Determine winning variant (highest reply rate, need at least 10 sends for significance)
    const sorted = [...variantMetrics].sort((a, b) => {
      if (b.reply_rate !== a.reply_rate) {
        return b.reply_rate - a.reply_rate;
      }
      return b.hot_rate - a.hot_rate;
    });
    
    // Only declare winner if both variants have at least 10 sends
    const hasEnoughData = variantMetrics.every(v => v.sent >= 10);
    const winner = hasEnoughData && sorted[0]?.sent >= 10 ? sorted[0]?.variant_key : null;
    
    // Calculate improvement percentage
    let improvement: number | null = null;
    if (winner && variantMetrics.length === 2) {
      const winnerMetric = variantMetrics.find(v => v.variant_key === winner);
      const loserMetric = variantMetrics.find(v => v.variant_key !== winner);
      if (winnerMetric && loserMetric && loserMetric.reply_rate > 0) {
        improvement = ((winnerMetric.reply_rate - loserMetric.reply_rate) / loserMetric.reply_rate) * 100;
      }
    }

    return NextResponse.json({
      variants: variantMetrics.map(v => ({
        ...v,
        is_winner: v.variant_key === winner && v.sent >= 10
      })),
      winner,
      improvement: improvement ? Number(improvement.toFixed(2)) : null
    });
  } catch (error: any) {
    console.error("Variant analytics error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to load variant analytics" 
    }, { status: 500 });
  }
}

