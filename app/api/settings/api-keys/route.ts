// API Key Management Endpoints
// GET /api/settings/api-keys - List API keys
// POST /api/settings/api-keys - Create API key

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// GET /api/settings/api-keys
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: apiKeys, error } = await serviceSupabase
    .from("api_keys")
    .select("id, name, key, created_at, last_used")
    .eq("workspace_id", membership.workspace_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mask keys (show only prefix)
  const maskedKeys = (apiKeys || []).map((key) => ({
    id: key.id,
    name: key.name,
    key: key.key.substring(0, 12) + "...", // Show first 12 chars
    created_at: key.created_at,
    last_used: key.last_used,
  }));

  return NextResponse.json({ data: maskedKeys });
}

// POST /api/settings/api-keys
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      { error: "Only owners and admins can create API keys" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { name, prefix = "ss_live" } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Generate API key: prefix_ + 32 random alphanumeric chars
  const randomPart = Array.from({ length: 32 }, () =>
    Math.random().toString(36).charAt(2)
  ).join("");
  const apiKey = `${prefix}_${randomPart}`;

  const { data: newKey, error } = await serviceSupabase
    .from("api_keys")
    .insert({
      workspace_id: membership.workspace_id,
      name,
      key: apiKey,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return full key (only shown once)
  return NextResponse.json(
    {
      data: {
        id: newKey.id,
        name: newKey.name,
        key: apiKey, // Full key shown only on creation
        created_at: newKey.created_at,
      },
    },
    { status: 201 }
  );
}

