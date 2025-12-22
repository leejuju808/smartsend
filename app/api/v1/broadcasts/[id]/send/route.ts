// POST /v1/broadcasts/{id}/send - Send immediately or schedule

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const broadcastId = req.nextUrl.pathname.split("/")[3]; // broadcasts/{id}/send
  if (!broadcastId) {
    throw new ApiError("400_INVALID_BODY", "Broadcast ID is required");
  }

  const body = await req.json();
  const { scheduled_at } = body;

  // Verify broadcast belongs to workspace
  const { data: broadcast, error: fetchError } = await supabase
    .from("broadcasts")
    .select("id, status")
    .eq("id", broadcastId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !broadcast) {
    throw new ApiError("404_NOT_FOUND", "Broadcast not found");
  }

  const updates: any = {
    status: scheduled_at ? "scheduled" : "sending",
    updated_at: new Date().toISOString(),
  };

  if (scheduled_at) {
    updates.scheduled_at = scheduled_at;
  }

  const { data: updatedBroadcast, error } = await supabase
    .from("broadcasts")
    .update(updates)
    .eq("id", broadcastId)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: updatedBroadcast });
});



