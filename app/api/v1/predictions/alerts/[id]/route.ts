// PATCH /v1/predictions/alerts/[id] - Acknowledge an alert

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const PATCH = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { id } = params;
  const body = await req.json();
  const acknowledged = body.acknowledged !== undefined ? body.acknowledged : true;

  // Verify the alert belongs to the workspace
  const { data: alert, error: fetchError } = await supabase
    .from("prediction_alerts")
    .select("workspace_id")
    .eq("id", id)
    .single();

  if (fetchError || !alert) {
    throw new ApiError("404_NOT_FOUND", "Alert not found", 404);
  }

  if (alert.workspace_id !== auth.workspaceId) {
    throw new ApiError("403_FORBIDDEN", "Access denied", 403);
  }

  // Get current user ID from API key if needed
  // For now, we'll leave acknowledged_by as null since API keys don't have user context
  const { data, error } = await supabase
    .from("prediction_alerts")
    .update({
      acknowledged,
      acknowledged_at: acknowledged ? new Date().toISOString() : null,
      acknowledged_by: null, // API keys don't have user context
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data });
});

