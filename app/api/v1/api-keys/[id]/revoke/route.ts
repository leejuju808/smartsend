// POST /v1/api-keys/:id/revoke - Revoke API key

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify API key belongs to workspace
  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("id, workspace_id")
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (!apiKey) {
    throw new ApiError("404_NOT_FOUND", "API key not found", 404);
  }

  // Revoke the key
  const { data: revokedKey, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: {
      id: revokedKey.id,
      revoked_at: revokedKey.revoked_at,
    },
  });
});




































