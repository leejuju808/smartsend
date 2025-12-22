import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;

    // Get last tuned timestamp from system_logs
    const { data: lastTunedLog } = await supabase
      .from("system_logs")
      .select("created_at")
      .eq("category", "ai_rewrite_tuning")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get stats by tone from llm_rewrite_feedback
    const { data: feedbackStats, error: feedbackError } = await supabase
      .from("llm_rewrite_feedback")
      .select("tone, engagement_score, message_count, positive_rate, meeting_rate")
      .eq("campaign_id", campaignId)
      .not("tone", "is", null)
      .order("created_at", { ascending: false });

    if (feedbackError) {
      console.error("Error fetching feedback stats:", feedbackError);
    }

    // Aggregate by tone (get latest for each tone)
    const toneMap = new Map<string, any>();
    if (feedbackStats) {
      for (const stat of feedbackStats) {
        const tone = stat.tone as string;
        if (!tone || toneMap.has(tone)) continue; // Keep first (latest) entry per tone
        toneMap.set(tone, {
          tone,
          engagement_score: stat.engagement_score as number,
          message_count: stat.message_count as number,
          positive_rate: stat.positive_rate as number,
          meeting_rate: stat.meeting_rate as number,
        });
      }
    }

    const stats = Array.from(toneMap.values());

    return NextResponse.json({
      last_tuned: lastTunedLog?.created_at || null,
      stats: stats,
    });
  } catch (error: any) {
    console.error("Error fetching AI learning status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch AI learning status" },
      { status: 500 }
    );
  }
}















