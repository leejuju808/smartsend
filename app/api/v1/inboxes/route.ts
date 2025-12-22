// GET /v1/inboxes - List inboxes

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Try sender_inboxes first (most common)
  let { data: inboxes, error } = await supabase
    .from("sender_inboxes")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false });

  if (error || !inboxes) {
    // Fallback: try email_accounts
    const { data: emailAccounts } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("workspace_id", auth.workspaceId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ data: emailAccounts || [] });
  }

  return NextResponse.json({ data: inboxes || [] });
});



