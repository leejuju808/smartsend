// POST /v1/campaigns/{id}/pause - Pause campaign

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/")[3]; // campaigns/{id}/pause
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  // Verify campaign belongs to workspace
  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !campaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  // Update status to paused
  const { data: updatedCampaign, error } = await supabase
    .from("campaigns")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: updatedCampaign });
});



