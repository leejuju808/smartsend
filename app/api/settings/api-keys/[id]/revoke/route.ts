// POST /api/settings/api-keys/{id}/revoke - Revoke API key

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyId = req.nextUrl.pathname.split("/")[4]; // settings/api-keys/{id}/revoke
  if (!keyId) {
    return NextResponse.json({ error: "API key ID is required" }, { status: 400 });
  }

  // Get workspace_id
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Check permissions
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only owners and admins can revoke API keys" },
      { status: 403 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify key belongs to workspace
  const { data: apiKey } = await serviceSupabase
    .from("api_keys")
    .select("id")
    .eq("id", keyId)
    .eq("workspace_id", membership.workspace_id)
    .single();

  if (!apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  // Revoke key
  const { error } = await serviceSupabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}



