import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

// Helper to get current org_id
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  // Fallback: get user's first org
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// GET /api/settings/sending-identities - List all identities for current org
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Get all identities for this org
    const { data: identities, error } = await supabase
      .from("email_credentials")
      .select("*")
      .eq("org_id", orgId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ identities: identities || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/settings/sending-identities - Create a new identity
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await req.json();
    const { identity_name, display_name, email_address, provider, is_primary } = body;

    if (!email_address || !provider) {
      return NextResponse.json(
        { error: "email_address and provider are required" },
        { status: 400 }
      );
    }

    // Validate provider
    if (!["gmail", "outlook"].includes(provider)) {
      return NextResponse.json(
        { error: "Provider must be 'gmail' or 'outlook'" },
        { status: 400 }
      );
    }

    // Check if identity already exists
    const { data: existing } = await supabase
      .from("email_credentials")
      .select("id")
      .eq("org_id", orgId)
      .eq("provider", provider)
      .eq("email_address", email_address)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Identity with this email already exists" },
        { status: 400 }
      );
    }

    // Create identity
    const { data: identity, error } = await supabase
      .from("email_credentials")
      .insert({
        org_id: orgId,
        identity_name: identity_name || null,
        display_name: display_name || null,
        email_address,
        provider,
        is_primary: is_primary || false,
        verified: false, // Will be verified through OAuth flow
        access_token: "", // Will be set during OAuth
        daily_send_limit: 500,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ identity });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























































