// DELETE /v1/webhooks/{id} - Delete webhook

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const DELETE = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const webhookId = req.nextUrl.pathname.split("/").pop();
  if (!webhookId) {
    throw new ApiError("400_INVALID_BODY", "Webhook ID is required");
  }

  // Verify webhook belongs to workspace
  const { data: webhook, error: fetchError } = await supabase
    .from("webhooks")
    .select("id")
    .eq("id", webhookId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !webhook) {
    throw new ApiError("404_NOT_FOUND", "Webhook not found");
  }

  const { error } = await supabase.from("webhooks").delete().eq("id", webhookId);

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ success: true });
});



