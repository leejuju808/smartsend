// app/api/hot-leads/mark-replied/route.ts
// Block 97000 — Mark Hot Lead as Replied + Track Response Time
// Records when a roofer responds to a hot lead and calculates response time

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { lead_id, message_id, reply_message_id, workspace_id } = await req.json();

    if (!lead_id || !message_id) {
      return NextResponse.json(
        { error: "Missing required fields: lead_id, message_id" },
        { status: 400 }
      );
    }

    // Get the original hot lead event to calculate response time
    const { data: heatEvent, error: heatError } = await supabase
      .from("lead_heat_events")
      .select("created_at, intent, confidence")
      .eq("message_id", message_id)
      .eq("intent", "hot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (heatError) {
      console.error("Error fetching heat event:", heatError);
    }

    // Calculate response time in seconds
    let responseTimeSeconds: number | null = null;
    if (heatEvent?.created_at) {
      const eventTime = new Date(heatEvent.created_at).getTime();
      const now = Date.now();
      responseTimeSeconds = Math.floor((now - eventTime) / 1000);
    }

    // Record response time
    if (responseTimeSeconds !== null) {
      const { error: insertError } = await supabase
        .from("lead_response_times")
        .insert({
          lead_id,
          user_id: user.id,
          workspace_id: workspace_id || null,
          message_id,
          reply_message_id: reply_message_id || null,
          seconds: responseTimeSeconds,
          heat_score: heatEvent?.intent || "hot",
        });

      if (insertError) {
        console.error("Error recording response time:", insertError);
        // Continue anyway - marking as replied is more important
      }
    }

    // Update lead status (optional - you might have your own status system)
    const { error: updateError } = await supabase
      .from("leads")
      .update({ 
        status: "replied",
        updated_at: new Date().toISOString()
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead status:", updateError);
    }

    return NextResponse.json({
      success: true,
      response_time_seconds: responseTimeSeconds,
    });
  } catch (error: any) {
    console.error("Mark replied error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}


























