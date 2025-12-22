// GET /v1/campaigns/{id}/steps - List steps
// POST /v1/campaigns/{id}/steps - Add a step

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET /v1/campaigns/{id}/steps
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/")[3]; // campaigns/{id}/steps
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  // Verify campaign belongs to workspace
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (campaignError || !campaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  // Get sequence steps (try different table names)
  let stepsQuery = supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", campaignId)
    .order("position", { ascending: true });

  const { data: steps, error } = await stepsQuery;

  // Fallback: try campaign_steps if sequence_steps doesn't exist
  if (error || !steps) {
    const { data: campaignSteps } = await supabase
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_no", { ascending: true });

    return NextResponse.json({ data: campaignSteps || [] });
  }

  return NextResponse.json({ data: steps || [] });
});

// POST /v1/campaigns/{id}/steps
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/")[3];
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  // Verify campaign belongs to workspace
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (campaignError || !campaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  const body = await req.json();
  const { subject, body: bodyText, position, wait_days } = body;

  if (!subject || !bodyText) {
    throw new ApiError("400_INVALID_BODY", "subject and body are required");
  }

  // Try to insert into sequence_steps first
  const { data: step, error } = await supabase
    .from("sequence_steps")
    .insert({
      sequence_id: campaignId,
      subject: subject,
      body_html: bodyText,
      position: position || 1,
      wait_days: wait_days || 0,
    })
    .select()
    .single();

  if (error) {
    // Fallback: try campaign_steps
    const { data: campaignStep, error: campaignStepError } = await supabase
      .from("campaign_steps")
      .insert({
        campaign_id: campaignId,
        subject_template: subject,
        body_html_template: bodyText,
        step_no: position || 1,
        offset_days: wait_days || 0,
      })
      .select()
      .single();

    if (campaignStepError) {
      throw new ApiError("500_INTERNAL_ERROR", campaignStepError.message, 500);
    }

    return NextResponse.json({ data: campaignStep }, { status: 201 });
  }

  return NextResponse.json({ data: step }, { status: 201 });
});



