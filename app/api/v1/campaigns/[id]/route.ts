// GET /v1/campaigns/{id} - Retrieve campaign details
// PATCH /v1/campaigns/{id} - Update campaign metadata

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET /v1/campaigns/{id}
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/").pop();
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (error || !campaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  return NextResponse.json({ data: campaign });
});

// PATCH /v1/campaigns/{id}
export const PATCH = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/").pop();
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  // Verify campaign belongs to workspace
  const { data: existingCampaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !existingCampaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  const body = await req.json();
  const updates: any = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.objective !== undefined) updates.objective = body.objective;
  if (body.status !== undefined) updates.status = body.status;
  if (body.from_email_account_id !== undefined)
    updates.from_email_account_id = body.from_email_account_id;
  if (body.daily_send_cap !== undefined) updates.daily_send_cap = body.daily_send_cap;

  updates.updated_at = new Date().toISOString();

  const { data: updatedCampaign, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", campaignId)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: updatedCampaign });
});



