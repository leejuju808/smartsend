// POST /v1/events/email - Ingest email events from external providers

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { type, email, campaign_id, step_id, time } = body;

  if (!type || !email) {
    throw new ApiError("400_INVALID_BODY", "type and email are required");
  }

  const validTypes = ["open", "click", "reply", "bounce", "spam"];
  if (!validTypes.includes(type)) {
    throw new ApiError(
      "400_INVALID_BODY",
      `type must be one of: ${validTypes.join(", ")}`
    );
  }

  // Find lead by email
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (!lead) {
    throw new ApiError("404_NOT_FOUND", "Lead not found");
  }

  // Insert event
  const eventData: any = {
    workspace_id: auth.workspaceId,
    lead_id: lead.id,
    event_type: type,
    email: email.toLowerCase(),
    created_at: time || new Date().toISOString(),
  };

  if (campaign_id) eventData.campaign_id = campaign_id;
  if (step_id) eventData.step_id = step_id;

  // Try email_events table
  let { data: event, error } = await supabase
    .from("email_events")
    .insert(eventData)
    .select()
    .single();

  if (error) {
    // Fallback: try send_logs or other event tables
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Update step stats if step_id provided
  if (step_id) {
    // This would update sequence_progress, campaign stats, etc.
    // Implementation depends on your schema
  }

  // Update suppression if bounce/spam
  if (type === "bounce" || type === "spam") {
    await supabase.from("suppressions").insert({
      email: email.toLowerCase(),
      workspace_id: auth.workspaceId,
      reason: type,
    });
  }

  return NextResponse.json({ data: event }, { status: 201 });
});



