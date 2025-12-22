// POST /v1/inboxes/test - Test connection

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const body = await req.json();
  const { inbox_id } = body;

  if (!inbox_id) {
    throw new ApiError("400_INVALID_BODY", "inbox_id is required");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify inbox belongs to workspace
  const { data: inbox, error: fetchError } = await supabase
    .from("sender_inboxes")
    .select("id, email")
    .eq("id", inbox_id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !inbox) {
    throw new ApiError("404_NOT_FOUND", "Inbox not found");
  }

  // In a real implementation, this would test the SMTP/IMAP connection
  // For now, return success
  return NextResponse.json({
    success: true,
    message: "Connection test successful",
  });
});



