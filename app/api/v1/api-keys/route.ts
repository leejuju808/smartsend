// GET /v1/api-keys - List API keys
// POST /v1/api-keys - Create API key

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

// GET list API keys (requires workspace admin)
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Note: API key management should ideally check workspace membership
  // For now, allow if API key belongs to workspace
  // In production, you'd want to verify the user creating the API key has admin/owner role
  const { data: apiKeys, error } = await supabase
    .from("api_keys")
    .select("id, name, created_at, last_used, revoked_at, environment, scopes")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Don't return full key, only metadata
  const sanitizedKeys = (apiKeys || []).map((key) => ({
    id: key.id,
    name: key.name,
    created_at: key.created_at,
    last_used: key.last_used,
    revoked_at: key.revoked_at,
    environment: key.environment,
    scopes: key.scopes,
    is_active: !key.revoked_at,
  }));

  return NextResponse.json({ data: sanitizedKeys });
});

// POST create API key
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { name, environment = "live", scopes = ["read", "write"], ip_whitelist } = body;

  // Generate API key
  const prefix = environment === "sandbox" || environment === "test" ? "ss_test_" : "ss_live_";
  const suffix = randomBytes(24).toString("base64").replace(/[+/]/g, "").substring(0, 32);
  const key = prefix + suffix;

  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .insert({
      workspace_id: auth.workspaceId,
      key,
      name,
      environment,
      scopes,
      ip_whitelist,
      is_sandbox: environment === "sandbox" || environment === "test",
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Return full key only on creation
  return NextResponse.json(
    {
      data: {
        id: apiKey.id,
        key, // Only time we return the full key
        name: apiKey.name,
        environment: apiKey.environment,
        scopes: apiKey.scopes,
        created_at: apiKey.created_at,
      },
    },
    { status: 201 }
  );
});




































