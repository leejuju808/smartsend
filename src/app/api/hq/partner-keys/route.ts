import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * AUREV HQ Partner API Keys Management
 * /api/hq/partner-keys
 */

/**
 * GET /api/hq/partner-keys
 * List all partner API keys for the current org
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    // Fetch partner API keys
    const { data: keys, error } = await supabaseAdmin
      .from("partner_api_keys")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching partner API keys:", error);
      return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
    }

    // Mask API keys for security
    const maskedKeys = (keys || []).map((key) => ({
      ...key,
      api_key: maskApiKey(key.api_key),
    }));

    return NextResponse.json({ keys: maskedKeys });
  } catch (error: any) {
    console.error("Partner keys fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hq/partner-keys
 * Create a new partner API key
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    const { label } = await req.json();

    if (!label || !label.trim()) {
      return NextResponse.json({ error: "Label required" }, { status: 400 });
    }

    // Generate unique API key
    const apiKey = generateApiKey();
    
    // Create partner API key
    const { data: key, error } = await supabaseAdmin
      .from("partner_api_keys")
      .insert({
        org_id: org.id,
        partner_name: label.trim(),
        api_key: apiKey,
        status: "active",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating partner API key:", error);
      return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
    }

    // Return full API key once (won't be shown again)
    return NextResponse.json({
      key: {
        ...key,
        api_key: key.api_key, // Show full key on creation
      },
    });
  } catch (error: any) {
    console.error("Partner key creation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/hq/partner-keys
 * Revoke a partner API key
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Key ID required" }, { status: 400 });
    }

    // Revoke the key
    const { error } = await supabaseAdmin
      .from("partner_api_keys")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("org_id", org.id);

    if (error) {
      console.error("Error revoking partner API key:", error);
      return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Partner key revocation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Generate a secure random API key
 */
function generateApiKey(): string {
  // Generate 64-character random hex string
  return `aurev_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Mask API key for display (show first 8 and last 4 characters)
 */
function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) return "***";
  return `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
}

