// GET /v1/broadcasts/{id}/stats - Broadcast analytics

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const broadcastId = req.nextUrl.pathname.split("/")[3]; // broadcasts/{id}/stats
  if (!broadcastId) {
    throw new ApiError("400_INVALID_BODY", "Broadcast ID is required");
  }

  // Verify broadcast belongs to workspace
  const { data: broadcast, error: fetchError } = await supabase
    .from("broadcasts")
    .select("id")
    .eq("id", broadcastId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !broadcast) {
    throw new ApiError("404_NOT_FOUND", "Broadcast not found");
  }

  // Try to get stats from view or calculate
  const { data: stats } = await supabase
    .from("v_broadcast_stats")
    .select("*")
    .eq("broadcast_id", broadcastId)
    .single();

  // Fallback: calculate basic stats
  if (!stats) {
    // This would need to query send_logs, email_events, etc.
    // For now, return placeholder structure
    return NextResponse.json({
      data: {
        total_recipients: 0,
        sent_count: 0,
        delivered_count: 0,
        opened_count: 0,
        clicked_count: 0,
        replied_count: 0,
        bounced_count: 0,
        spam_count: 0,
        unsubscribe_count: 0,
        delivery_rate: 0,
        open_rate: 0,
        click_rate: 0,
        reply_rate: 0,
      },
    });
  }

  return NextResponse.json({ data: stats });
});



