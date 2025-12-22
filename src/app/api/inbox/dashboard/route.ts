// GET /api/inbox/dashboard - Response time stats and urgency counts

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;

  try {
    // Get all threads
    const { data: threads } = await supabaseAdmin
      .from("inbox_threads")
      .select("id, unread_count, urgency, last_intent, updated_at")
      .eq("workspace_id", workspace_id);

    // Get all inbound messages with timestamps
    const { data: inboundMessages } = await supabaseAdmin
      .from("inbox_messages")
      .select("id, thread_id, created_at, direction")
      .eq("workspace_id", workspace_id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1000);

    // Calculate average response time (time between inbound and next outbound)
    let totalResponseTime = 0;
    let responseCount = 0;

    if (inboundMessages && inboundMessages.length > 0) {
      for (const inbound of inboundMessages) {
        // Find next outbound message in same thread
        const { data: nextOutbound } = await supabaseAdmin
          .from("inbox_messages")
          .select("created_at")
          .eq("thread_id", inbound.thread_id)
          .eq("direction", "outbound")
          .gt("created_at", inbound.created_at)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (nextOutbound) {
          const responseTime =
            new Date(nextOutbound.created_at).getTime() -
            new Date(inbound.created_at).getTime();
          totalResponseTime += responseTime;
          responseCount++;
        }
      }
    }

    const avgResponseTimeHours =
      responseCount > 0 ? totalResponseTime / responseCount / (1000 * 60 * 60) : 0;

    // Count stats
    const stats = {
      totalThreads: (threads || []).length,
      unreadMessages: (threads || []).reduce((sum, t) => sum + (t.unread_count || 0), 0),
      urgentThreads: (threads || []).filter((t) => t.urgency === "urgent").length,
      threadsNeedingAction: (threads || []).filter((t) => (t.unread_count || 0) > 0).length,
      averageResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
      averageResponseTimeMinutes: Math.round(avgResponseTimeHours * 60),
      intentBreakdown: {} as Record<string, number>,
    };

    // Count intents
    (threads || []).forEach((thread) => {
      const intent = thread.last_intent || "unknown";
      stats.intentBreakdown[intent] = (stats.intentBreakdown[intent] || 0) + 1;
    });

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error in dashboard API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































